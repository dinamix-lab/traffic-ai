import { randomUUID, createHash } from "node:crypto";
import { AuthError } from "../auth/errors";
import type { AuthService } from "../auth/service";
import type { WorkspaceService } from "../workspaces/service";
import { CrmError, DinamixClient } from "./client";
import { normalizeEvent, processEvent } from "./processor";
import { crmConfig } from "./config";
import type {
  CrmConfig,
  CrmProvider,
  CrmRepository,
  CrmRun,
  CrmSnapshot,
} from "./types";
export class CrmService {
  constructor(
    private auth: AuthService,
    private workspaces: WorkspaceService,
    private store: CrmRepository,
    private options: {
      config?: () => CrmConfig;
      provider?: (
        before: () => Promise<void>,
        defer: (until: number) => void,
      ) => CrmProvider;
      now?: () => number;
      wait?: (ms: number) => Promise<void>;
    } = {},
  ) {}
  private now() {
    return (this.options.now || Date.now)();
  }
  private config() {
    return (this.options.config || crmConfig)();
  }
  private access(token: string | undefined, w: string, admin = false) {
    if (admin) this.auth.requireAdmin(token);
    return this.workspaces.requireAccess(token, w);
  }
  private target(w: string, token: string | undefined, worker: boolean) {
    const c = this.config();
    if (worker) {
      // Worker is limited to the environment binding; it never accepts an arbitrary tenant or workspace.
      const target = this.workerWorkspace();
      if (!target || target.id !== w || !target.active)
        throw new AuthError("Workspace CRM indisponível.", 403);
    } else {
      const target = this.access(token, w, true);
      if (!target.active || target.slug !== c.workspaceSlug)
        throw new AuthError(
          "A chave CRM está vinculada a outro workspace ou o workspace está inativo.",
          403,
        );
    }
    return c;
  }
  workerWorkspace() {
    // Read-only configured workspace lookup supplied through the repository composition.
    return this.workerLookup?.(this.config().workspaceSlug);
  }
  workerLookup?: (slug: string) => { id: string; active: boolean } | undefined;
  snapshot(token: string | undefined, w: string): CrmSnapshot {
    const workspace = this.access(token, w);
    let config: CrmConfig,
      configError = "";
    try {
      config = this.config();
    } catch (e) {
      config = crmConfig({});
      configError =
        e instanceof AuthError ? e.message : "Configuração CRM inválida.";
    }
    const state = this.store.state(w);
    const {
      cursor,
      tenantId: _,
      leaseOwner: __,
      leaseUntil: ___,
      workspaceId: ____,
      credentialFingerprint: _____,
      authRejected: ______,
      ...safe
    } = state;
    void _;
    void __;
    void ___;
    void ____;
    void _____;
    void ______;
    return {
      configured: !!config.key,
      bound: workspace.slug === config.workspaceSlug,
      currency: config.currency,
      state: {
        ...safe,
        ...(configError
          ? { status: "error" as const, lastError: configError }
          : {}),
        hasCursor: cursor !== null,
        status: configError
          ? "error"
          : state.leaseOwner && state.leaseUntil > this.now()
            ? "syncing"
            : state.status === "syncing"
              ? "error"
              : state.status,
      },
      runs:
        this.auth.requireUser(token).role === "admin" ? this.store.runs(w) : [],
      leads: this.store.entities(w, "leads"),
      calls: this.store.entities(w, "calls"),
      proposals: this.store.entities(w, "proposals"),
      sales: this.store.entities(w, "sales"),
    };
  }
  async run(
    token: string | undefined,
    w: string,
    mode: "health" | "sync",
    worker = false,
  ) {
    const config = this.target(w, token, worker);
    if (!config.key) throw new CrmError("missing_key");
    const fingerprint = createHash("sha256").update(config.key).digest("hex");
    const owner = randomUUID(),
      now = this.now();
    if (!this.store.acquire(w, owner, now, 90000))
      return { busy: true as const };
    const run: CrmRun = {
      id: owner,
      startedAt: now,
      finishedAt: null,
      status: "running",
      events: 0,
      pages: 0,
      error: null,
    };
    const wait =
      this.options.wait || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const check = () => {
      this.target(w, token, worker);
      this.store.renew(w, owner, this.now(), 90000);
    };
    const before = async () => {
      check();
      const at = this.store.reserveRequest(this.now());
      if (at - this.now() > 60000) throw new CrmError("rate_limit", at);
      if (at > this.now()) await wait(at - this.now());
      check();
    };
    const client = this.options.provider
      ? this.options.provider(before, (until) =>
          this.store.deferRequests(until),
        )
      : new DinamixClient(config.key, {
          beforeRequest: before,
          defer: (until) => this.store.deferRequests(until),
        });
    try {
      this.store.transaction(() => {
        this.store.assertLease(w, owner, this.now());
        const s = this.store.state(w);
        if (s.credentialFingerprint !== fingerprint) {
          s.credentialFingerprint = fingerprint;
          s.authRejected = false;
          s.nextAttemptAt = 0;
        }
        if (s.authRejected && mode === "sync")
          throw new CrmError("unauthorized");
        if (s.nextAttemptAt > this.now())
          throw new CrmError("rate_limit", s.nextAttemptAt);
        this.store.saveState({
          ...s,
          lastAttemptAt: now,
          status: mode === "sync" ? "syncing" : s.status,
          lastError: null,
        });
        this.store.saveRun(w, run);
      });
      if (mode === "health") {
        const result = await client.health();
        check();
        this.store.transaction(() => {
          const s = this.store.state(w);
          this.store.saveState({
            ...s,
            lastHealthAt: this.now(),
            apiVersion: result.version,
            status: "connected",
            lastError: null,
            authRejected: false,
          });
        });
      } else {
        let more = true;
        const seen = new Set<string>();
        while (more) {
          check();
          const current = this.store.state(w).cursor;
          const page = await client.events(
            current !== null ? { cursor: current } : { since: config.since },
          );
          check();
          if (
            !Array.isArray(page.events) ||
            page.events.length > 100 ||
            (page.events.length > 0 && !page.next_cursor) ||
            typeof page.has_more !== "boolean" ||
            !(
              page.next_cursor === null ||
              (typeof page.next_cursor === "string" &&
                page.next_cursor.length > 0)
            ) ||
            (page.has_more &&
              (!page.next_cursor ||
                page.next_cursor === current ||
                seen.has(page.next_cursor)))
          )
            throw new CrmError("contract");
          const parsed = page.events.map(normalizeEvent);
          let imported = 0;
          this.store.transaction(() => {
            this.store.assertLease(w, owner, this.now());
            const state = this.store.state(w);
            if (state.cursor !== current) throw new CrmError("lease");
            for (const event of parsed) {
              if (event.tenant_id) {
                if (state.tenantId && state.tenantId !== event.tenant_id)
                  throw new CrmError("contract");
                state.tenantId = event.tenant_id;
              }
              if (processEvent(this.store, w, event)) imported++;
            }
            state.cursor = page.next_cursor ?? state.cursor;
            state.totalEvents += imported;
            state.lastEvents = run.events + imported;
            this.store.saveState(state);
            this.store.saveRun(w, {
              ...run,
              events: run.events + imported,
              pages: run.pages + 1,
            });
          });
          run.events += imported;
          run.pages++;
          more = page.has_more;
          if (page.next_cursor) seen.add(page.next_cursor);
        }
        check();
        this.store.transaction(() => {
          const s = this.store.state(w);
          this.store.saveState({
            ...s,
            status: "connected",
            lastSuccessAt: this.now(),
            lastSyncStatus: "success",
            lastEvents: run.events,
            lastError: null,
            nextAttemptAt: 0,
            authRejected: false,
          });
        });
      }
      run.status = "success";
    } catch (e) {
      run.status = "error";
      run.error =
        e instanceof CrmError
          ? e.message
          : e instanceof AuthError
            ? "Sincronização interrompida: revise acesso, configuração ou limite do lote."
            : "Falha de processamento. Página revertida e cursor preservado.";
      try {
        this.store.assertLease(w, owner, this.now());
        const s = this.store.state(w);
        this.store.saveState({
          ...s,
          status: "error",
          lastError: run.error,
          lastAttemptAt: now,
          lastSyncStatus: mode === "sync" ? "error" : s.lastSyncStatus,
          authRejected:
            e instanceof CrmError && e.code === "unauthorized"
              ? true
              : s.authRejected,
          lastEvents: mode === "sync" ? run.events : s.lastEvents,
          nextAttemptAt: e instanceof CrmError ? e.retryAt : 0,
        });
      } catch {
        /* A worker that lost its lease cannot change integration state. */
      }
    } finally {
      run.finishedAt = this.now();
      try {
        this.store.assertLease(w, owner, this.now());
        this.store.saveRun(w, run);
      } catch {
        /* The replacement owner is authoritative. */
      }
      this.store.release(w, owner);
    }
    if (!worker) this.access(token, w, true);
    return { busy: false as const, run };
  }
  async tick() {
    const workspace = this.workerWorkspace();
    if (!workspace?.active || !this.config().key) return { waiting: true };
    const s = this.store.state(workspace.id);
    if (
      s.authRejected &&
      s.credentialFingerprint ===
        createHash("sha256").update(this.config().key).digest("hex")
    )
      return { waiting: true };
    return this.run(undefined, workspace.id, "sync", true);
  }
}

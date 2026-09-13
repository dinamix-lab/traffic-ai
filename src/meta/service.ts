import { randomBytes, randomUUID } from "node:crypto";
import { AuthError } from "../auth/errors";
import type { AuthService } from "../auth/service";
import type { WorkspaceService } from "../workspaces/service";
import { digest, metaConfig, TokenVault, type MetaConfig } from "./security";
import { MetaApiError } from "./client";
import type {
  MetaProvider,
  MetaRepository,
  MetaRow,
  MetaAccount,
  MetaSnapshot,
  ResourceKind,
  StoredResource,
  SyncRun,
} from "./types";
const string = (v: unknown) => (typeof v === "string" ? v : "");
const id = (v: unknown) => (/^\d+$/.test(string(v)) ? String(v) : "");
const pick = (row: MetaRow, fields: string) =>
  Object.fromEntries(
    fields
      .split(",")
      .filter((f) => row[f] !== undefined)
      .map((f) => [f, row[f]]),
  );
export const fields = {
  campaigns:
    "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time",
  adsets:
    "id,campaign_id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,start_time,end_time,created_time,updated_time",
  ads: "id,campaign_id,adset_id,name,status,effective_status,creative{id}",
  creatives:
    "id,name,object_type,image_url,thumbnail_url,video_id,object_story_id,effective_object_story_id",
  insights:
    "campaign_id,adset_id,ad_id,date_start,date_stop,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,cost_per_action_type,account_currency",
};
export function dataMode(connection: MetaSnapshot["connection"]) {
  return connection ? "meta" : "demo";
}
export class MetaService {
  constructor(
    private auth: AuthService,
    private workspaces: WorkspaceService,
    private store: MetaRepository,
    private provider: (c: MetaConfig) => MetaProvider,
    private config: () => MetaConfig = metaConfig,
  ) {}
  private access(session: string | undefined, w: string, admin = false) {
    if (admin) this.auth.requireAdmin(session);
    return this.workspaces.requireAccess(session, w);
  }
  private writable(session: string | undefined, w: string) {
    const workspace = this.access(session, w, true);
    if (!workspace.active)
      throw new AuthError(
        "Ative o workspace antes de alterar a integração.",
        409,
      );
    return workspace;
  }
  private unlocked(w: string) {
    for (const r of this.store.runs(w)) {
      if (r.status !== "running") continue;
      if (Date.now() - r.startedAt < 15 * 60 * 1000)
        throw new AuthError(
          "Há uma sincronização em andamento. Aguarde antes de alterar a conexão.",
          409,
        );
      this.store.saveRun(w, {
        ...r,
        status: "failed",
        finishedAt: Date.now(),
        errors: ["Sincronização interrompida; execute novamente."],
      });
    }
  }
  snapshot(session: string | undefined, w: string): MetaSnapshot {
    this.access(session, w);
    const admin = this.auth.requireUser(session).role === "admin";
    let configured = true,
      configurationMessage = "Configuração disponível";
    try {
      this.config();
    } catch (e) {
      configured = false;
      configurationMessage =
        e instanceof AuthError
          ? e.message
          : "Revise a configuração privada da Meta.";
    }
    const connection = this.store.connection(w);
    if (connection?.connected && connection.expiresAt <= Date.now())
      connection.health = "Autorização expirada. Reconecte.";
    const accounts = this.store.accounts(w);
    const selected = new Set(
      accounts.filter((a) => a.selected).map((a) => a.id),
    );
    return {
      configured,
      configurationMessage,
      connection,
      accounts: admin ? accounts : accounts.filter((a) => a.selected),
      resources: this.store
        .resources(w)
        .filter((r) => (r.accountId ? selected.has(r.accountId) : admin)),
      runs: admin ? this.store.runs(w) : [],
      events: admin ? this.store.events(w) : [],
    };
  }
  begin(session: string | undefined, w: string) {
    this.writable(session, w);
    const c = this.config();
    const state = randomBytes(32).toString("base64url");
    this.store.putState(
      digest(state),
      w,
      digest(session!),
      Date.now() + 600000,
    );
    const url = new URL(`https://www.facebook.com/${c.version}/dialog/oauth`);
    url.search = new URLSearchParams({
      client_id: c.appId,
      redirect_uri: c.redirectUri,
      response_type: "code",
      state,
      ...(c.configId
        ? { config_id: c.configId }
        : { scope: c.scopes.join(",") }),
    }).toString();
    return { url: url.toString(), state };
  }
  async complete(
    session: string | undefined,
    state: string,
    cookie: string | undefined,
    code: string,
  ) {
    this.auth.requireAdmin(session);
    if (!cookie || state !== cookie || !state || !code || code.length > 4096)
      throw new AuthError(
        "Retorno OAuth inválido. Inicie uma nova conexão.",
        403,
      );
    const pending = this.store.transaction(() => {
      const r = this.store.state(digest(state));
      if (!r || r.expiresAt < Date.now() || r.sessionHash !== digest(session!))
        throw new AuthError("State expirado ou de outra sessão.", 403);
      this.writable(session, r.workspaceId);
      this.unlocked(r.workspaceId);
      if (!this.store.consumeState(digest(state)))
        throw new AuthError("State já utilizado.", 403);
      return r;
    });
    const w = pending.workspaceId;
    const prior = this.store.connection(w)?.revision;
    const c = this.config(),
      api = this.provider(c);
    try {
      const credential = await api.exchange(code);
      const me = await api.get(credential.token, "me", { fields: "id,name" });
      const permissions = await api.list(credential.token, "me/permissions");
      const granted = permissions
        .filter((p) => p.status === "granted")
        .map((p) => string(p.permission));
      if (!granted.includes("ads_read") || !id(me.id))
        throw new MetaApiError("permission");
      const accounts = await this.discoverAccounts(api, credential.token);
      const encrypted = new TokenVault(c.key).seal(w, credential.token);
      this.store.transaction(() => {
        this.writable(session, w);
        this.unlocked(w);
        if (this.store.connection(w)?.revision !== prior)
          throw new AuthError("A conexão mudou. Inicie novamente.", 409);
        const oldSelected = new Set(
          this.store
            .accounts(w)
            .filter((a) => a.selected)
            .map((a) => a.id),
        );
        this.store.saveAccounts(
          w,
          accounts.map((a) => ({ ...a, selected: oldSelected.has(a.id) })),
        );
        this.store.saveConnection(
          {
            workspaceId: w,
            revision: randomUUID(),
            connected: true,
            userName: string(me.name),
            userId: id(me.id),
            expiresAt: credential.expiresAt,
            lastSyncAt: this.store.connection(w)?.lastSyncAt || null,
            health: "Autorizado. Selecione contas e sincronize.",
            permissions: granted,
          },
          encrypted,
        );
        this.store.event(w, "OAuth concluído; contas autorizadas atualizadas");
      });
      return w;
    } catch (e) {
      this.store.event(w, "OAuth não concluído");
      throw e;
    }
  }
  private async discoverAccounts(
    api: MetaProvider,
    token: string,
  ): Promise<MetaAccount[]> {
    const rows = await api.list(token, "me/adaccounts", {
      fields: "id,name,account_status,currency,timezone_name,business{id,name}",
    });
    return rows.map((r) => {
      if (!/^act_\d+$/.test(string(r.id)))
        throw new MetaApiError("invalid_response");
      const b = r.business as MetaRow | undefined;
      return {
        id: string(r.id),
        name: string(r.name),
        status: typeof r.account_status === "number" ? r.account_status : null,
        currency: string(r.currency) || null,
        timezone: string(r.timezone_name) || null,
        business: b && id(b.id) ? { id: id(b.id), name: string(b.name) } : null,
        selected: false,
      };
    });
  }
  private credential(w: string) {
    const connection = this.store.connection(w);
    if (!connection?.connected || connection.expiresAt <= Date.now())
      throw new MetaApiError("token_invalid");
    const c = this.config();
    const encrypted = this.store.credential(w);
    if (!encrypted) throw new MetaApiError("token_invalid");
    return {
      connection,
      api: this.provider(c),
      token: new TokenVault(c.key).open(w, encrypted),
      encrypted,
    };
  }
  async select(session: string | undefined, w: string, input: unknown) {
    this.writable(session, w);
    if (
      !Array.isArray(input) ||
      input.length > 20 ||
      input.some((v) => typeof v !== "string") ||
      new Set(input).size !== input.length
    )
      throw new AuthError("Selecione até 20 contas válidas.");
    this.unlocked(w);
    const { connection, api, token } = this.credential(w);
    const available = await this.discoverAccounts(api, token);
    if (input.some((v) => !available.some((a) => a.id === v)))
      throw new AuthError(
        "Uma conta selecionada não está mais autorizada pela Meta.",
        403,
      );
    this.store.transaction(() => {
      this.writable(session, w);
      this.unlocked(w);
      if (this.store.connection(w)?.revision !== connection.revision)
        throw new AuthError("A conexão mudou. Recarregue.", 409);
      const previous = this.store
        .accounts(w)
        .filter((a) => a.selected)
        .map((a) => a.id);
      this.store.saveAccounts(
        w,
        available.map((a) => ({ ...a, selected: input.includes(a.id) })),
      );
      for (const a of input)
        if (!previous.includes(a))
          this.store.event(w, `Conta adicionada: ${a}`);
      for (const a of previous)
        if (!input.includes(a))
          this.store.event(w, `Conta removida da seleção: ${a}`);
    });
  }
  disconnect(session: string | undefined, w: string) {
    this.writable(session, w);
    this.store.transaction(() => {
      this.unlocked(w);
      this.store.disconnect(w);
      this.store.event(
        w,
        "Conexão local removida e credencial apagada; histórico preservado",
      );
    });
  }
  async sync(session: string | undefined, w: string) {
    this.writable(session, w);
    const context = this.credential(w);
    const { api, token, connection } = context;
    const accounts = this.store.accounts(w).filter((a) => a.selected);
    if (!accounts.length)
      throw new AuthError(
        "Selecione pelo menos uma conta antes de sincronizar.",
        409,
      );
    const run: SyncRun = {
      id: randomUUID(),
      startedAt: Date.now(),
      finishedAt: null,
      status: "running",
      imported: 0,
      errors: [],
    };
    this.store.transaction(() => {
      this.unlocked(w);
      this.store.saveRun(w, run);
    });
    const deadline = Date.now() + 4 * 60000;
    const check = () => {
      this.writable(session, w);
      if (Date.now() > deadline) throw new MetaApiError("incomplete");
      if (this.store.connection(w)?.revision !== connection.revision)
        throw new AuthError("A conexão mudou durante a sincronização.", 409);
    };
    let importedAccounts = 0;
    try {
      for (const account of accounts) {
        check();
        try {
          const accountInfo = await api.get(token, account.id, {
            fields: "id,name,account_status,currency,timezone_name",
          });
          check();
          if (accountInfo.id !== account.id)
            throw new MetaApiError("permission");
          const timezone =
            string(accountInfo.timezone_name) || account.timezone;
          if (!timezone) throw new MetaApiError("invalid_response");
          const today = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date());
          const end = new Date(`${today}T12:00:00Z`);
          end.setUTCDate(end.getUTCDate() - 1);
          const sinceDate = new Date(end);
          sinceDate.setUTCDate(sinceDate.getUTCDate() - 59);
          const since = sinceDate.toISOString().slice(0, 10),
            until = end.toISOString().slice(0, 10);
          const batches: { kind: ResourceKind; rows: StoredResource[] }[] = [];
          for (const kind of [
            "campaigns",
            "adsets",
            "ads",
            "creatives",
            "insights",
          ] as const) {
            check();
            const path = `${account.id}/${kind === "creatives" ? "adcreatives" : kind}`;
            const params: Record<string, string> = { fields: fields[kind] };
            if (kind === "insights")
              Object.assign(params, {
                level: "ad",
                time_increment: "1",
                time_range: JSON.stringify({ since, until }),
                use_unified_attribution_setting: "true",
              });
            const rows = await api.list(token, path, params);
            const mapped = rows.map((r) => {
              const resourceId = kind === "insights" ? id(r.ad_id) : id(r.id);
              if (!resourceId) throw new MetaApiError("invalid_response");
              const date = kind === "insights" ? string(r.date_start) : "";
              if (
                kind === "insights" &&
                (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                  date < since ||
                  date > until)
              )
                throw new MetaApiError("invalid_response");
              const payload = pick(
                r,
                fields[kind].replace("creative{id}", "creative"),
              );
              if (kind === "ads")
                payload.creative = {
                  id: id((r.creative as MetaRow | undefined)?.id),
                };
              return {
                accountId: account.id,
                kind,
                id: resourceId,
                date,
                payload,
              };
            });
            batches.push({ kind, rows: mapped });
          }
          check();
          this.store.transaction(() => {
            check();
            for (const batch of batches)
              this.store.replaceResources(
                w,
                account.id,
                batch.kind,
                batch.rows,
                since,
              );
          });
          run.imported += batches.reduce((n, b) => n + b.rows.length, 0);
          importedAccounts++;
        } catch (e) {
          if (e instanceof AuthError && !(e instanceof MetaApiError)) throw e;
          run.errors.push(
            `${account.id}: ${e instanceof MetaApiError ? e.category : "falha interna"}`,
          );
          if (e instanceof MetaApiError && e.category === "token_invalid")
            throw e;
        }
      }
      for (const [kind, path, permission, requestedFields] of [
        ["businesses", "me/businesses", "business_management", "id,name"],
        ["pages", "me/accounts", "pages_show_list", "id,name"],
        [
          "instagram",
          "me/accounts",
          "instagram_basic",
          "id,instagram_business_account{id,username}",
        ],
      ] as const) {
        if (!connection.permissions.includes(permission)) continue;
        try {
          check();
          const rows = await api.list(token, path, { fields: requestedFields });
          check();
          this.store.transaction(() =>
            this.store.replaceResources(
              w,
              "",
              kind,
              rows
                .filter((r) => id(r.id))
                .map((r) => ({
                  accountId: "",
                  kind,
                  id: id(r.id),
                  date: "",
                  payload: pick(
                    r,
                    kind === "instagram"
                      ? "id,instagram_business_account"
                      : "id,name",
                  ),
                })),
            ),
          );
        } catch (e) {
          run.errors.push(
            `${kind}: ${e instanceof MetaApiError ? e.category : "indisponível"}`,
          );
        }
      }
      for (const account of accounts) {
        try {
          check();
          const rows = await api.list(token, `${account.id}/adspixels`, {
            fields: "id,name",
          });
          check();
          this.store.transaction(() =>
            this.store.replaceResources(
              w,
              account.id,
              "pixels",
              rows
                .filter((r) => id(r.id))
                .map((r) => ({
                  accountId: account.id,
                  kind: "pixels",
                  id: id(r.id),
                  date: "",
                  payload: pick(r, "id,name"),
                })),
            ),
          );
        } catch (e) {
          run.errors.push(
            `pixels ${account.id}: ${e instanceof MetaApiError ? e.category : "indisponível"}`,
          );
        }
      }
      check();
      run.status =
        importedAccounts === 0
          ? "failed"
          : run.errors.length
            ? "partial"
            : "success";
    } catch (e) {
      run.status = "failed";
      run.errors.push(
        e instanceof MetaApiError
          ? e.category
          : e instanceof AuthError
            ? "Acesso ou contexto alterado"
            : "Falha interna",
      );
    }
    run.finishedAt = Date.now();
    this.store.transaction(() => {
      this.store.saveRun(w, run);
      const current = this.store.connection(w);
      if (current?.revision === connection.revision) {
        const invalid = run.errors.some((e) => e.includes("token_invalid"));
        this.store.saveConnection(
          {
            ...current,
            expiresAt: invalid ? 0 : current.expiresAt,
            lastSyncAt: importedAccounts ? run.finishedAt : current.lastSyncAt,
            health: invalid
              ? "Autorização inválida. Reconecte."
              : run.status === "success"
                ? "Saudável"
                : run.status === "partial"
                  ? "Sincronização parcial. Consulte o histórico."
                  : "Falha na sincronização. Consulte o histórico.",
          },
          context.encrypted,
        );
      }
      this.store.event(
        w,
        `Sincronização ${run.status}: ${run.imported} registros`,
      );
    });
    this.access(session, w, true);
    return run;
  }
}

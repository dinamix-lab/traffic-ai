import { randomUUID } from "node:crypto";
import { AuthError } from "../auth/errors";
import type { AuthService } from "../auth/service";
import type { WorkspaceInput, WorkspaceStore } from "./types";
import { validGoals } from "../domain/preferences";
import { demoAccountsProvider } from "../integrations/mock-provider";
export function validateWorkspace(input: unknown): WorkspaceInput {
  if (!input || typeof input !== "object")
    throw new AuthError("Dados do workspace inválidos.");
  const d = input as Record<string, unknown>;
  if (
    typeof d.name !== "string" ||
    d.name.trim().length < 2 ||
    d.name.trim().length > 100
  )
    throw new AuthError("O nome deve ter de 2 a 100 caracteres.");
  if (
    typeof d.slug !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug) ||
    d.slug.length > 80
  )
    throw new AuthError(
      "Use um slug de até 80 caracteres, com letras minúsculas, números e hífens.",
    );
  if (
    typeof d.active !== "boolean" ||
    typeof d.description !== "string" ||
    d.description.length > 500
  )
    throw new AuthError("Revise o status e a descrição (até 500 caracteres).");
  if (typeof d.timezone !== "string") throw new AuthError("Timezone inválido.");
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: d.timezone }).format();
  } catch {
    throw new AuthError("Informe um timezone IANA válido.");
  }
  if (
    typeof d.currency !== "string" ||
    !["BRL", "USD", "EUR"].includes(d.currency)
  )
    throw new AuthError("Selecione BRL, USD ou EUR.");
  return {
    name: d.name.trim(),
    slug: d.slug,
    active: d.active,
    description: d.description.trim(),
    timezone: d.timezone,
    currency: d.currency,
  };
}
export class WorkspaceService {
  constructor(
    private auth: AuthService,
    private store: WorkspaceStore,
  ) {}
  accessible(token?: string) {
    const user = this.auth.requireUser(token);
    return this.store
      .list()
      .filter(
        (w) =>
          user.role === "admin" ||
          (w.active && this.store.hasMember(w.id, user.id)),
      );
  }
  requireAccess(token: string | undefined, id: string) {
    const user = this.auth.requireUser(token);
    const w = this.store.get(id);
    if (
      !w ||
      (user.role !== "admin" &&
        (!w.active || !this.store.hasMember(id, user.id)))
    )
      throw new AuthError("Você não tem acesso a este workspace.", 403);
    return w;
  }
  list(token?: string) {
    this.auth.requireAdmin(token);
    return this.store
      .list()
      .map((w) => ({
        ...w,
        managers: this.store.members(w.id),
        integrationCount: this.store
          .integrations(w.id)
          .filter((i) => i.connected).length,
      }));
  }
  detail(token: string | undefined, id: string) {
    this.auth.requireAdmin(token);
    const workspace = this.requireAccess(token, id);
    return {
      workspace,
      members: this.store.members(id),
      eligibleManagers: this.store.eligibleManagers(),
      integrations: this.store.integrations(id),
      accounts: this.store.accounts(id),
    };
  }
  save(token: string | undefined, input: unknown, id?: string) {
    this.auth.requireAdmin(token);
    const fields = validateWorkspace(input);
    return this.store.transaction(() => {
      this.auth.requireAdmin(token);
      const old = id ? this.requireAccess(token, id) : undefined;
      if (this.store.list().some((w) => w.slug === fields.slug && w.id !== id))
        throw new AuthError("Este slug já está em uso.", 409);
      const workspace = {
        ...fields,
        id: old?.id || randomUUID(),
        createdAt: old?.createdAt || Date.now(),
      };
      this.store.save(workspace);
      return workspace;
    });
  }
  setMembers(token: string | undefined, id: string, userIds: unknown) {
    this.auth.requireAdmin(token);
    if (
      !Array.isArray(userIds) ||
      userIds.some((v) => typeof v !== "string") ||
      new Set(userIds).size !== userIds.length
    )
      throw new AuthError("Seleção de gestores inválida.");
    return this.store.transaction(() => {
      this.auth.requireAdmin(token);
      this.requireAccess(token, id);
      const eligible = this.store.eligibleManagers();
      if (userIds.some((value) => !eligible.some((u) => u.id === value)))
        throw new AuthError("Selecione somente gestores existentes.");
      this.store.setMembers(id, userIds);
      return this.store.members(id);
    });
  }
  integrations(token: string | undefined, id: string) {
    const workspace = this.requireAccess(token, id);
    return {
      workspace,
      integrations: this.store.integrations(id),
      accounts: this.store.accounts(id),
    };
  }
  metaAction(token: string | undefined, id: string, action: unknown) {
    this.auth.requireAdmin(token);
    if (!["connect", "sync", "disconnect"].includes(String(action)))
      throw new AuthError("Ação inválida.");
    return this.store.transaction(() => {
      const actor = this.auth.requireAdmin(token);
      const w = this.requireAccess(token, id);
      if (!w.active)
        throw new AuthError(
          "Ative o workspace antes de alterar a integração.",
          409,
        );
      const meta = this.store
        .integrations(id)
        .find((i) => i.provider === "meta")!;
      if (action === "connect") {
        this.store.saveIntegration({
          ...meta,
          connected: true,
          connectedBy: actor.name,
          businessManager: w.name,
          lastSyncAt: Date.now() - 180000,
        });
        if (!meta.lastSyncAt && !this.store.accounts(id).length)
          for (const a of demoAccountsProvider.discover(w, meta.id, Date.now()))
            this.store.saveAccount(a);
      }
      if (action === "sync") {
        if (!meta.connected)
          throw new AuthError("Simule a conexão antes de sincronizar.", 409);
        const now = Date.now();
        this.store.saveIntegration({ ...meta, lastSyncAt: now });
        for (const a of this.store.accounts(id))
          if (a.active && a.syncEnabled)
            this.store.saveAccount({ ...a, lastSyncAt: now });
      }
      if (action === "disconnect") {
        this.store.saveIntegration({
          ...meta,
          connected: false,
          connectedBy: null,
          businessManager: null,
        });
        for (const a of this.store.accounts(id))
          this.store.saveAccount({ ...a, syncEnabled: false });
      }
      return this.store.integrations(id);
    });
  }
  updateAccount(
    token: string | undefined,
    workspaceId: string,
    accountId: string,
    input: unknown,
  ) {
    this.auth.requireAdmin(token);
    if (!input || typeof input !== "object")
      throw new AuthError("Dados da conta inválidos.");
    const d = input as Record<string, unknown>;
    if (
      typeof d.workspaceId !== "string" ||
      typeof d.syncEnabled !== "boolean" ||
      !Array.isArray(d.managerIds) ||
      d.managerIds.some((i) => typeof i !== "string")
    )
      throw new AuthError("Revise o workspace, gestores e sincronização.");
    const targetId = d.workspaceId;
    const managerIds = [...new Set(d.managerIds as string[])];
    const syncEnabled = d.syncEnabled;
    return this.store.transaction(() => {
      this.auth.requireAdmin(token);
      this.requireAccess(token, workspaceId);
      const account = this.store
        .accounts(workspaceId)
        .find((a) => a.id === accountId);
      if (!account)
        throw new AuthError("Conta não encontrada neste workspace.", 404);
      const target = this.requireAccess(token, targetId);
      const meta = this.store
        .integrations(targetId)
        .find((i) => i.provider === "meta")!;
      if (!target.active || !meta.connected)
        throw new AuthError(
          "O workspace de destino deve estar ativo e com conexão Meta simulada.",
          409,
        );
      if (syncEnabled && !account.active)
        throw new AuthError("Uma conta inativa não pode sincronizar.");
      if (
        managerIds.some(
          (id) =>
            !this.store
              .members(targetId)
              .some((m) => m.userId === id && m.active),
        )
      )
        throw new AuthError(
          "Vincule os gestores ativos à equipe do workspace de destino primeiro.",
        );
      const next = {
        ...account,
        workspaceId: targetId,
        integrationId: meta.id,
        syncEnabled,
        managerIds,
      };
      this.store.saveAccount(next);
      return next;
    });
  }
  goals(token: string | undefined, id: string) {
    this.requireAccess(token, id);
    return this.store.goals(id);
  }
  saveGoals(token: string | undefined, id: string, input: unknown) {
    if (!validGoals(input))
      throw new AuthError(
        "Metas inválidas. Use valores positivos e qualificação até 100%.",
      );
    return this.store.transaction(() => {
      this.requireAccess(token, id);
      this.store.saveGoals(id, input);
      return input;
    });
  }
}

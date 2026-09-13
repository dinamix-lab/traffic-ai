import { DatabaseSync } from "node:sqlite";
import type {
  WorkspaceStore,
  Workspace,
  WorkspaceMember,
  Integration,
  AdAccount,
} from "../workspaces/types";
import type { Goals } from "../domain/types";
import { defaultGoals } from "../domain/preferences";
import { integrationCatalog } from "../integrations/mock-provider";
const schema = `
CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1)),created_at INTEGER NOT NULL,description TEXT NOT NULL,timezone TEXT NOT NULL,currency TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workspace_users(workspace_id TEXT NOT NULL REFERENCES workspaces(id),user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(workspace_id,user_id));
CREATE TABLE IF NOT EXISTS integrations(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),provider TEXT NOT NULL,connected INTEGER NOT NULL DEFAULT 0,connected_by TEXT,business_manager TEXT,last_sync_at INTEGER,UNIQUE(workspace_id,provider),UNIQUE(workspace_id,id));
CREATE TABLE IF NOT EXISTS ad_accounts(id TEXT PRIMARY KEY,integration_id TEXT NOT NULL REFERENCES integrations(id),external_id TEXT NOT NULL UNIQUE,name TEXT NOT NULL,active INTEGER NOT NULL,sync_enabled INTEGER NOT NULL,last_sync_at INTEGER);
CREATE TABLE IF NOT EXISTS workspace_ad_accounts(workspace_id TEXT NOT NULL REFERENCES workspaces(id),ad_account_id TEXT NOT NULL UNIQUE REFERENCES ad_accounts(id) ON DELETE CASCADE,PRIMARY KEY(workspace_id,ad_account_id));
CREATE TABLE IF NOT EXISTS ad_account_users(workspace_id TEXT NOT NULL,ad_account_id TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(ad_account_id,user_id),FOREIGN KEY(workspace_id,ad_account_id) REFERENCES workspace_ad_accounts(workspace_id,ad_account_id) ON DELETE CASCADE,FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_users(workspace_id,user_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS workspace_goals(workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS workspace_users_user ON workspace_users(user_id);
CREATE INDEX IF NOT EXISTS integrations_workspace ON integrations(workspace_id);
`;
export class SqliteWorkspaceStore implements WorkspaceStore {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.transaction(() => {
      this.db.exec(schema);
      const migrated = this.db
        .prepare("SELECT version FROM schema_migrations WHERE version=2")
        .get();
      if (!migrated) {
        const now = Date.now();
        for (const [id, name, slug] of [
          ["ws-scale", "Scale Digital", "scale-digital"],
          ["ws-loca", "Loca Easy", "loca-easy"],
          ["ws-dinamix", "Dinamix", "dinamix"],
        ])
          this.save({
            id: id!,
            name: name!,
            slug: slug!,
            active: true,
            createdAt: now,
            description: "Workspace de demonstração",
            timezone: "America/Sao_Paulo",
            currency: "BRL",
          });
        // Existing managers retain their original Scale Digital access. New users receive no implicit membership.
        this.db.exec(
          "INSERT OR IGNORE INTO workspace_users SELECT 'ws-scale', id FROM users WHERE role='manager'",
        );
        this.db.prepare("INSERT INTO schema_migrations VALUES(2,?)").run(now);
      }
    });
  }
  close() {
    this.db.close();
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  list() {
    return (
      this.db
        .prepare(
          "SELECT id,name,slug,active,created_at AS createdAt,description,timezone,currency FROM workspaces ORDER BY created_at,name",
        )
        .all() as unknown as Workspace[]
    ).map((w) => ({ ...w, active: !!w.active }));
  }
  get(id: string) {
    return this.list().find((w) => w.id === id);
  }
  save(w: Workspace) {
    this.db
      .prepare(
        "INSERT INTO workspaces VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,active=excluded.active,description=excluded.description,timezone=excluded.timezone,currency=excluded.currency",
      )
      .run(
        w.id,
        w.name,
        w.slug,
        Number(w.active),
        w.createdAt,
        w.description,
        w.timezone,
        w.currency,
      );
    for (const item of integrationCatalog)
      this.db
        .prepare(
          "INSERT OR IGNORE INTO integrations(id,workspace_id,provider) VALUES(?,?,?)",
        )
        .run(`${w.id}-${item.provider}`, w.id, item.provider);
    this.db
      .prepare("INSERT OR IGNORE INTO workspace_goals VALUES(?,?)")
      .run(w.id, JSON.stringify(defaultGoals));
  }
  hasMember(workspaceId: string, userId: string) {
    return !!this.db
      .prepare(
        "SELECT user_id FROM workspace_users WHERE workspace_id=? AND user_id=?",
      )
      .get(workspaceId, userId);
  }
  members(workspaceId: string) {
    return (
      this.db
        .prepare(
          "SELECT wu.workspace_id AS workspaceId,u.id AS userId,u.name,u.active FROM workspace_users wu JOIN users u ON wu.user_id=u.id WHERE wu.workspace_id=? AND u.role='manager' ORDER BY u.name",
        )
        .all(workspaceId) as unknown as WorkspaceMember[]
    ).map((m) => ({ ...m, active: !!m.active }));
  }
  setMembers(workspaceId: string, ids: string[]) {
    for (const row of this.db
      .prepare("SELECT user_id FROM workspace_users WHERE workspace_id=?")
      .all(workspaceId))
      if (!ids.includes(String(row.user_id)))
        this.db
          .prepare(
            "DELETE FROM workspace_users WHERE workspace_id=? AND user_id=?",
          )
          .run(workspaceId, row.user_id!);
    for (const id of ids)
      this.db
        .prepare("INSERT OR IGNORE INTO workspace_users VALUES(?,?)")
        .run(workspaceId, id);
  }
  eligibleManagers() {
    return (
      this.db
        .prepare(
          "SELECT id,name,active FROM users WHERE role='manager' ORDER BY name",
        )
        .all() as unknown as { id: string; name: string; active: boolean }[]
    ).map((u) => ({ ...u, active: !!u.active }));
  }
  integrations(workspaceId: string) {
    return (
      this.db
        .prepare(
          "SELECT id,workspace_id AS workspaceId,provider,connected,connected_by AS connectedBy,business_manager AS businessManager,last_sync_at AS lastSyncAt FROM integrations WHERE workspace_id=?",
        )
        .all(workspaceId) as unknown as Integration[]
    ).map((i) => ({
      ...i,
      connected: !!i.connected,
      simulated: true as const,
    }));
  }
  saveIntegration(i: Integration) {
    this.db
      .prepare(
        "UPDATE integrations SET connected=?,connected_by=?,business_manager=?,last_sync_at=? WHERE id=? AND workspace_id=?",
      )
      .run(
        Number(i.connected),
        i.connectedBy,
        i.businessManager,
        i.lastSyncAt,
        i.id,
        i.workspaceId,
      );
  }
  accounts(workspaceId: string) {
    return (
      this.db
        .prepare(
          "SELECT a.id,wa.workspace_id AS workspaceId,a.integration_id AS integrationId,a.external_id AS externalId,a.name,a.active,a.sync_enabled AS syncEnabled,a.last_sync_at AS lastSyncAt FROM ad_accounts a JOIN workspace_ad_accounts wa ON a.id=wa.ad_account_id WHERE wa.workspace_id=? ORDER BY a.name",
        )
        .all(workspaceId) as unknown as AdAccount[]
    ).map((a) => ({
      ...a,
      active: !!a.active,
      syncEnabled: !!a.syncEnabled,
      managerIds: this.db
        .prepare(
          "SELECT user_id FROM ad_account_users WHERE workspace_id=? AND ad_account_id=?",
        )
        .all(workspaceId, a.id)
        .map((r) => String(r.user_id)),
    }));
  }
  saveAccount(a: AdAccount) {
    this.db
      .prepare(
        "INSERT INTO ad_accounts VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET integration_id=excluded.integration_id,name=excluded.name,active=excluded.active,sync_enabled=excluded.sync_enabled,last_sync_at=excluded.last_sync_at",
      )
      .run(
        a.id,
        a.integrationId,
        a.externalId,
        a.name,
        Number(a.active),
        Number(a.syncEnabled),
        a.lastSyncAt,
      );
    this.db
      .prepare("DELETE FROM ad_account_users WHERE ad_account_id=?")
      .run(a.id);
    this.db
      .prepare(
        "DELETE FROM workspace_ad_accounts WHERE ad_account_id=? AND workspace_id<>?",
      )
      .run(a.id, a.workspaceId);
    this.db
      .prepare("INSERT OR IGNORE INTO workspace_ad_accounts VALUES(?,?)")
      .run(a.workspaceId, a.id);
    for (const id of a.managerIds)
      this.db
        .prepare("INSERT INTO ad_account_users VALUES(?,?,?)")
        .run(a.workspaceId, a.id, id);
  }
  deleteAccounts(workspaceId: string) {
    this.db
      .prepare(
        "DELETE FROM ad_accounts WHERE id IN(SELECT ad_account_id FROM workspace_ad_accounts WHERE workspace_id=?)",
      )
      .run(workspaceId);
  }
  goals(workspaceId: string): Goals {
    const row = this.db
      .prepare("SELECT payload FROM workspace_goals WHERE workspace_id=?")
      .get(workspaceId);
    if (!row) throw new Error("Metas não encontradas");
    return JSON.parse(String(row.payload));
  }
  saveGoals(workspaceId: string, goals: Goals) {
    this.db
      .prepare("UPDATE workspace_goals SET payload=? WHERE workspace_id=?")
      .run(JSON.stringify(goals), workspaceId);
  }
}

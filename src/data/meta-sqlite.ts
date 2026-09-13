import { DatabaseSync } from "node:sqlite";
import type {
  Connection,
  MetaAccount,
  MetaRepository,
  ResourceKind,
  StoredResource,
  SyncRun,
} from "../meta/types";
export class SqliteMetaRepository implements MetaRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS meta_connections(workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),payload TEXT NOT NULL,credential TEXT);
 CREATE TABLE IF NOT EXISTS meta_oauth_states(hash TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),session_hash TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS meta_accounts(workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(workspace_id,id));
 CREATE TABLE IF NOT EXISTS meta_resources(workspace_id TEXT NOT NULL REFERENCES workspaces(id),account_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,date TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(workspace_id,account_id,kind,id,date));
 CREATE TABLE IF NOT EXISTS meta_insight_revisions(workspace_id TEXT NOT NULL REFERENCES workspaces(id),account_id TEXT NOT NULL,id TEXT NOT NULL,date TEXT NOT NULL,captured_at INTEGER NOT NULL,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS meta_sync_runs(workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS meta_events(workspace_id TEXT NOT NULL REFERENCES workspaces(id),at INTEGER NOT NULL,event TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS meta_runs_workspace ON meta_sync_runs(workspace_id);
 CREATE INDEX IF NOT EXISTS meta_events_workspace ON meta_events(workspace_id,at);
 `);
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  connection(w: string): Connection | null {
    const r = this.db
      .prepare("SELECT payload FROM meta_connections WHERE workspace_id=?")
      .get(w);
    return r ? JSON.parse(String(r.payload)) : null;
  }
  credential(w: string) {
    const r = this.db
      .prepare("SELECT credential FROM meta_connections WHERE workspace_id=?")
      .get(w);
    return r?.credential ? String(r.credential) : null;
  }
  saveConnection(c: Connection, encrypted: string) {
    this.db
      .prepare(
        "INSERT INTO meta_connections VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET payload=excluded.payload,credential=excluded.credential",
      )
      .run(c.workspaceId, JSON.stringify(c), encrypted);
  }
  state(hash: string) {
    const r = this.db
      .prepare(
        "SELECT workspace_id AS workspaceId,session_hash AS sessionHash,expires_at AS expiresAt FROM meta_oauth_states WHERE hash=?",
      )
      .get(hash);
    return (
      (r as
        | { workspaceId: string; sessionHash: string; expiresAt: number }
        | undefined) || null
    );
  }
  putState(hash: string, w: string, sessionHash: string, expiresAt: number) {
    this.db
      .prepare(
        "DELETE FROM meta_oauth_states WHERE expires_at<? OR session_hash=?",
      )
      .run(Date.now(), sessionHash);
    this.db
      .prepare("INSERT INTO meta_oauth_states VALUES(?,?,?,?)")
      .run(hash, w, sessionHash, expiresAt);
  }
  consumeState(hash: string) {
    return (
      this.db.prepare("DELETE FROM meta_oauth_states WHERE hash=?").run(hash)
        .changes === 1
    );
  }
  accounts(w: string): MetaAccount[] {
    return this.db
      .prepare(
        "SELECT payload FROM meta_accounts WHERE workspace_id=? ORDER BY id",
      )
      .all(w)
      .map((r) => JSON.parse(String(r.payload)));
  }
  saveAccounts(w: string, accounts: MetaAccount[]) {
    this.db.prepare("DELETE FROM meta_accounts WHERE workspace_id=?").run(w);
    for (const a of accounts)
      this.db
        .prepare("INSERT INTO meta_accounts VALUES(?,?,?)")
        .run(w, a.id, JSON.stringify(a));
  }
  resources(w: string): StoredResource[] {
    return this.db
      .prepare(
        "SELECT account_id AS accountId,kind,id,date,payload FROM meta_resources WHERE workspace_id=? ORDER BY date,id",
      )
      .all(w)
      .map((r) => ({
        ...r,
        payload: JSON.parse(String(r.payload)),
      })) as StoredResource[];
  }
  replaceResources(
    w: string,
    a: string,
    k: ResourceKind,
    rows: StoredResource[],
    since?: string,
  ) {
    if (k === "insights") {
      if (since)
        this.db
          .prepare(
            "DELETE FROM meta_resources WHERE workspace_id=? AND account_id=? AND kind=? AND date>=?",
          )
          .run(w, a, k, since);
    } else
      this.db
        .prepare(
          "DELETE FROM meta_resources WHERE workspace_id=? AND account_id=? AND kind=?",
        )
        .run(w, a, k);
    for (const r of rows) {
      this.db
        .prepare(
          "INSERT INTO meta_resources VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,account_id,kind,id,date) DO UPDATE SET payload=excluded.payload",
        )
        .run(w, a, k, r.id, r.date, JSON.stringify(r.payload));
      if (k === "insights")
        this.db
          .prepare("INSERT INTO meta_insight_revisions VALUES(?,?,?,?,?,?)")
          .run(w, a, r.id, r.date, Date.now(), JSON.stringify(r.payload));
    }
  }
  runs(w: string): SyncRun[] {
    return this.db
      .prepare(
        "SELECT payload FROM meta_sync_runs WHERE workspace_id=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(w)
      .map((r) => JSON.parse(String(r.payload)));
  }
  saveRun(w: string, r: SyncRun) {
    this.db
      .prepare(
        "INSERT INTO meta_sync_runs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(w, r.id, JSON.stringify(r));
  }
  event(w: string, event: string) {
    this.db
      .prepare("INSERT INTO meta_events VALUES(?,?,?)")
      .run(w, Date.now(), event);
  }
  events(w: string) {
    return this.db
      .prepare(
        "SELECT at,event FROM meta_events WHERE workspace_id=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(w) as { at: number; event: string }[];
  }
  disconnect(w: string) {
    const c = this.connection(w);
    if (c) {
      c.connected = false;
      c.revision = crypto.randomUUID();
      c.health = "Desconectado; histórico preservado";
      this.db
        .prepare(
          "UPDATE meta_connections SET payload=?,credential=NULL WHERE workspace_id=?",
        )
        .run(JSON.stringify(c), w);
    }
    this.db
      .prepare("DELETE FROM meta_oauth_states WHERE workspace_id=?")
      .run(w);
  }
}

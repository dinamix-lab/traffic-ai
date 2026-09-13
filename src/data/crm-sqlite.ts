import { DatabaseSync } from "node:sqlite";
import { CrmError } from "../crm/client";
import type {
  CrmRepository,
  CrmState,
  CrmEvent,
  Entity,
  EntityKind,
  CrmRun,
} from "../crm/types";
const table = {
  leads: "crm_leads",
  calls: "crm_calls",
  proposals: "crm_proposals",
  sales: "crm_sales",
};
export class SqliteCrmRepository implements CrmRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.transaction(() => {
      this.db
        .exec(`CREATE TABLE IF NOT EXISTS crm_integration_state(workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),integration_name TEXT NOT NULL,payload TEXT NOT NULL,lease_owner TEXT,lease_until INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS crm_processed_events(event_id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),event_type TEXT NOT NULL,occurred_at TEXT NOT NULL,processed_at INTEGER NOT NULL,payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS crm_events_workspace ON crm_processed_events(workspace_id,occurred_at);
 CREATE TABLE IF NOT EXISTS crm_runs(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS crm_http_gate(id INTEGER PRIMARY KEY CHECK(id=1),next_request_at INTEGER NOT NULL);
 INSERT OR IGNORE INTO crm_http_gate VALUES(1,0);`);
      for (const name of Object.values(table))
        this.db.exec(
          `CREATE TABLE IF NOT EXISTS ${name}(workspace_id TEXT NOT NULL REFERENCES workspaces(id),external_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(workspace_id,external_id));`,
        );
    });
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  state(w: string): CrmState {
    const row = this.db
      .prepare(
        "SELECT payload,lease_owner,lease_until FROM crm_integration_state WHERE workspace_id=?",
      )
      .get(w);
    return row
      ? {
          ...JSON.parse(String(row.payload)),
          leaseOwner: row.lease_owner,
          leaseUntil: row.lease_until,
        }
      : {
          workspaceId: w,
          integrationName: "dinamix-vendas",
          cursor: null,
          tenantId: null,
          status: "disconnected",
          lastHealthAt: null,
          lastAttemptAt: null,
          lastSuccessAt: null,
          lastError: null,
          apiVersion: null,
          totalEvents: 0,
          lastEvents: 0,
          nextAttemptAt: 0,
          leaseOwner: null,
          leaseUntil: 0,
        };
  }
  saveState(s: CrmState) {
    this.db
      .prepare(
        "INSERT INTO crm_integration_state VALUES(?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET payload=excluded.payload",
      )
      .run(
        s.workspaceId,
        s.integrationName,
        JSON.stringify({ ...s, leaseOwner: null, leaseUntil: 0 }),
        s.leaseOwner,
        s.leaseUntil,
      );
  }
  acquire(w: string, owner: string, now: number, leaseMs: number) {
    return this.transaction(() => {
      const previous = this.state(w);
      this.saveState(previous);
      const acquired =
        this.db
          .prepare(
            "UPDATE crm_integration_state SET lease_owner=?,lease_until=? WHERE workspace_id=? AND (lease_owner IS NULL OR lease_until<=?)",
          )
          .run(owner, now + leaseMs, w, now).changes === 1;
      if (acquired && previous.leaseOwner) {
        const orphan = this.runs(w).find(
          (r) => r.id === previous.leaseOwner && r.status === "running",
        );
        if (orphan)
          this.saveRun(w, {
            ...orphan,
            status: "error",
            finishedAt: now,
            error:
              "Execução interrompida; lease expirado. Retomada pelo último cursor confirmado.",
          });
      }
      return acquired;
    });
  }
  renew(w: string, owner: string, now: number, leaseMs: number) {
    if (
      this.db
        .prepare(
          "UPDATE crm_integration_state SET lease_until=? WHERE workspace_id=? AND lease_owner=? AND lease_until>?",
        )
        .run(now + leaseMs, w, owner, now).changes !== 1
    )
      throw new CrmError("lease");
  }
  assertLease(w: string, owner: string, now: number) {
    const s = this.state(w);
    if (s.leaseOwner !== owner || s.leaseUntil <= now)
      throw new CrmError("lease");
  }
  release(w: string, owner: string) {
    this.db
      .prepare(
        "UPDATE crm_integration_state SET lease_owner=NULL,lease_until=0 WHERE workspace_id=? AND lease_owner=?",
      )
      .run(w, owner);
  }
  processed(w: string, id: string) {
    const row = this.db
      .prepare("SELECT workspace_id FROM crm_processed_events WHERE event_id=?")
      .get(id);
    if (row && row.workspace_id !== w) throw new CrmError("contract");
    return !!row;
  }
  record(w: string, e: CrmEvent) {
    this.db
      .prepare("INSERT INTO crm_processed_events VALUES(?,?,?,?,?,?)")
      .run(
        e.event_id,
        w,
        e.event_type,
        e.occurred_at,
        Date.now(),
        JSON.stringify(e),
      );
  }
  entity(w: string, k: EntityKind, id: string): Entity | null {
    const row = this.db
      .prepare(
        `SELECT payload FROM ${table[k]} WHERE workspace_id=? AND external_id=?`,
      )
      .get(w, id);
    return row ? JSON.parse(String(row.payload)) : null;
  }
  saveEntity(w: string, k: EntityKind, e: Entity) {
    this.db
      .prepare(
        `INSERT INTO ${table[k]} VALUES(?,?,?) ON CONFLICT(workspace_id,external_id) DO UPDATE SET payload=excluded.payload`,
      )
      .run(w, e.id, JSON.stringify(e));
  }
  entities(w: string, k: EntityKind): Entity[] {
    return this.db
      .prepare(
        `SELECT payload FROM ${table[k]} WHERE workspace_id=? ORDER BY external_id`,
      )
      .all(w)
      .map((r) => JSON.parse(String(r.payload)));
  }
  saveRun(w: string, r: CrmRun) {
    this.db
      .prepare(
        "INSERT INTO crm_runs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(r.id, w, JSON.stringify(r));
  }
  runs(w: string): CrmRun[] {
    return this.db
      .prepare(
        "SELECT payload FROM crm_runs WHERE workspace_id=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(w)
      .map((r) => JSON.parse(String(r.payload)));
  }
  history(w: string): CrmEvent[] {
    return this.db
      .prepare(
        "SELECT payload FROM crm_processed_events WHERE workspace_id=? ORDER BY occurred_at,event_id",
      )
      .all(w)
      .map((r) => JSON.parse(String(r.payload)));
  }
  reserveRequest(now: number) {
    return this.transaction(() => {
      const row = this.db
        .prepare("SELECT next_request_at FROM crm_http_gate WHERE id=1")
        .get()!;
      const at = Math.max(now, Number(row.next_request_at));
      this.db
        .prepare("UPDATE crm_http_gate SET next_request_at=? WHERE id=1")
        .run(at + 1100);
      return at;
    });
  }
  deferRequests(until: number) {
    this.db
      .prepare(
        "UPDATE crm_http_gate SET next_request_at=MAX(next_request_at,?) WHERE id=1",
      )
      .run(until);
  }
}

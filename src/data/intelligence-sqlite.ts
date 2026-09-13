import { DatabaseSync } from "node:sqlite";
import { defaults, type IntelligenceConfig } from "../intelligence/config";
import type {
  Collections,
  IntelligenceRepository,
} from "../intelligence/repository";
const tables = {
  recommendations: "intelligence_recommendations",
  decisions: "intelligence_decisions",
  creatives: "intelligence_creatives",
  tests: "intelligence_reel_tests",
  journal: "intelligence_journal",
  notifications: "intelligence_notifications",
  audit: "intelligence_audit",
};
export class SqliteIntelligenceRepository implements IntelligenceRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.transaction(() => {
      for (const t of Object.values(tables))
        this.db.exec(
          `CREATE TABLE IF NOT EXISTS ${t}(workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(workspace_id,id));`,
        );
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS intelligence_config(workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),payload TEXT NOT NULL);",
      );
    });
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  list<K extends keyof Collections>(kind: K, w: string): Collections[K][] {
    return this.db
      .prepare(
        `SELECT payload FROM ${tables[kind]} WHERE workspace_id=? ORDER BY rowid DESC`,
      )
      .all(w)
      .map((row) => JSON.parse(String(row.payload)));
  }
  get<K extends keyof Collections>(
    kind: K,
    w: string,
    id: string,
  ): Collections[K] | null {
    const row = this.db
      .prepare(
        `SELECT payload FROM ${tables[kind]} WHERE workspace_id=? AND id=?`,
      )
      .get(w, id);
    return row ? JSON.parse(String(row.payload)) : null;
  }
  save<K extends keyof Collections>(kind: K, value: Collections[K]) {
    this.db
      .prepare(
        `INSERT INTO ${tables[kind]} VALUES(?,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET payload=excluded.payload`,
      )
      .run(value.workspaceId, value.id, JSON.stringify(value));
  }
  config(w: string) {
    const row = this.db
      .prepare("SELECT payload FROM intelligence_config WHERE workspace_id=?")
      .get(w);
    return row
      ? { ...defaults, ...JSON.parse(String(row.payload)) }
      : structuredClone(defaults);
  }
  saveConfig(w: string, config: IntelligenceConfig) {
    this.db
      .prepare(
        "INSERT INTO intelligence_config VALUES(?,?) ON CONFLICT(workspace_id) DO UPDATE SET payload=excluded.payload",
      )
      .run(w, JSON.stringify(config));
  }
}

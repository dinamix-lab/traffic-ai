import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AuthStore, UserRecord, SessionRecord } from "../auth/types";

const schema = `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 role TEXT NOT NULL CHECK(role IN ('admin','manager')), active INTEGER NOT NULL CHECK(active IN (0,1)),
 password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, user_id TEXT NOT NULL, action TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL, consumed_at INTEGER
);
INSERT OR IGNORE INTO schema_migrations VALUES (1, unixepoch() * 1000);
`;
type SqlUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager";
  active: number;
  password_hash: string;
  created_at: number;
  last_login_at: number | null;
};
function mapUser(row: unknown): UserRecord | undefined {
  if (!row) return undefined;
  const r = row as SqlUser;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    active: r.active === 1,
    passwordHash: r.password_hash,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
  };
}
export class SqliteAuthStore implements AuthStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.transaction(() => this.db.exec(schema));
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
  getUser(id: string) {
    return mapUser(this.db.prepare("SELECT * FROM users WHERE id = ?").get(id));
  }
  findUser(email: string) {
    return mapUser(
      this.db.prepare("SELECT * FROM users WHERE email = ?").get(email),
    );
  }
  listUsers() {
    return this.db
      .prepare("SELECT * FROM users ORDER BY created_at DESC, name")
      .all()
      .map((row) => mapUser(row)!);
  }
  insertUser(u: UserRecord) {
    this.db
      .prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        u.id,
        u.name,
        u.email,
        u.role,
        Number(u.active),
        u.passwordHash,
        u.createdAt,
        u.lastLoginAt,
      );
  }
  updateUser(u: UserRecord) {
    this.db
      .prepare(
        "UPDATE users SET name=?, email=?, role=?, active=?, password_hash=?, last_login_at=? WHERE id=?",
      )
      .run(
        u.name,
        u.email,
        u.role,
        Number(u.active),
        u.passwordHash,
        u.lastLoginAt,
        u.id,
      );
  }
  activeAdmins() {
    return (
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role='admin' AND active=1",
        )
        .get() as { count: number }
    ).count;
  }
  getSession(hash: string): SessionRecord | undefined {
    const row = this.db
      .prepare(
        "SELECT token_hash AS tokenHash, user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token_hash = ?",
      )
      .get(hash);
    return row as unknown as SessionRecord | undefined;
  }
  insertSession(s: SessionRecord) {
    this.db
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES (?, ?, ?)")
      .run(s.tokenHash, s.userId, s.expiresAt);
  }
  deleteSession(hash: string) {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
  }
  revokeSessions(id: string) {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    this.db
      .prepare("DELETE FROM password_reset_tokens WHERE user_id = ?")
      .run(id);
  }
  reserveAttempt(key: string, limit: number, now: number) {
    this.db.prepare("DELETE FROM login_attempts WHERE reset_at <= ?").run(now);
    const row = this.db
      .prepare("SELECT count FROM login_attempts WHERE key = ?")
      .get(key) as { count: number } | undefined;
    if (row && row.count >= limit) return false;
    this.db
      .prepare(
        "INSERT INTO login_attempts VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      )
      .run(key, now + 15 * 60 * 1000);
    return true;
  }
  clearAttempts(key: string) {
    this.db.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
  }
  audit(actor: string | null, user: string, action: string, now: number) {
    this.db
      .prepare(
        "INSERT INTO audit_events(actor_id,user_id,action,created_at) VALUES (?,?,?,?)",
      )
      .run(actor, user, action, now);
  }
}

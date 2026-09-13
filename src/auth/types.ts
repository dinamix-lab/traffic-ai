export type Role = "admin" | "manager";
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: number;
  lastLoginAt: number | null;
}
export interface UserRecord extends PublicUser {
  passwordHash: string;
}
export interface SessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}
export interface UserInput {
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface AuthStore {
  transaction<T>(work: () => T): T;
  getUser(id: string): UserRecord | undefined;
  findUser(email: string): UserRecord | undefined;
  listUsers(): UserRecord[];
  insertUser(user: UserRecord): void;
  updateUser(user: UserRecord): void;
  activeAdmins(): number;
  getSession(hash: string): SessionRecord | undefined;
  insertSession(session: SessionRecord): void;
  deleteSession(hash: string): void;
  revokeSessions(userId: string): void;
  reserveAttempt(key: string, limit: number, now: number): boolean;
  clearAttempts(key: string): void;
  audit(
    actorId: string | null,
    userId: string,
    action: string,
    now: number,
  ): void;
}
export function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}
export const roleLabel = (role: Role) =>
  role === "admin" ? "Administrador" : "Gestor de tráfego";

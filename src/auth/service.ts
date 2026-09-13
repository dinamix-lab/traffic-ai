import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AuthError } from "./errors";
import { dummyPasswordCheck, hashPassword, verifyPassword } from "./password";
import { normalizeEmail, validateUser } from "./validation";
import { publicUser, type AuthStore } from "./types";
export const SESSION_SECONDS = 8 * 60 * 60;
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class AuthService {
  constructor(
    private store: AuthStore,
    private now: () => number = Date.now,
  ) {}
  currentUser(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = this.store.getSession(tokenHash(token));
    if (!session || session.expiresAt <= this.now()) return null;
    const user = this.store.getUser(session.userId);
    return user?.active ? publicUser(user) : null;
  }
  requireUser(token?: string) {
    const user = this.currentUser(token);
    if (!user) throw new AuthError("Sua sessão expirou. Entre novamente.", 401);
    return user;
  }
  requireAdmin(token?: string) {
    const user = this.requireUser(token);
    if (user.role !== "admin")
      throw new AuthError("Acesso permitido somente a administradores.", 403);
    return user;
  }
  listUsers(token?: string) {
    this.requireAdmin(token);
    return this.store.listUsers().map(publicUser);
  }
  async login(emailInput: unknown, passwordInput: unknown) {
    const invalid = () =>
      new AuthError("E-mail ou senha incorretos, ou usuário inativo.", 401);
    let email: string;
    try {
      email = normalizeEmail(emailInput);
    } catch {
      throw invalid();
    }
    if (
      typeof passwordInput !== "string" ||
      !passwordInput ||
      passwordInput.length > 128
    )
      throw invalid();
    const key = tokenHash(email);
    const allowed = this.store.transaction(
      () =>
        this.store.reserveAttempt("global", 100, this.now()) &&
        this.store.reserveAttempt(key, 5, this.now()),
    );
    if (!allowed)
      throw new AuthError(
        "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.",
        429,
      );
    const user = this.store.findUser(email);
    const matches = user
      ? await verifyPassword(passwordInput, user.passwordHash)
      : (await dummyPasswordCheck(passwordInput), false);
    if (!user || !matches || !user.active) throw invalid();
    return this.store.transaction(() => {
      const fresh = this.store.getUser(user.id);
      if (!fresh?.active || fresh.passwordHash !== user.passwordHash)
        throw invalid();
      const token = randomBytes(32).toString("hex");
      const expiresAt = this.now() + SESSION_SECONDS * 1000;
      this.store.insertSession({
        tokenHash: tokenHash(token),
        userId: fresh.id,
        expiresAt,
      });
      this.store.updateUser({ ...fresh, lastLoginAt: this.now() });
      this.store.clearAttempts(key);
      this.store.audit(fresh.id, fresh.id, "login", this.now());
      return {
        token,
        expiresAt,
        user: publicUser({ ...fresh, lastLoginAt: this.now() }),
      };
    });
  }
  logout(token?: string) {
    if (token) {
      const user = this.currentUser(token);
      this.store.deleteSession(tokenHash(token));
      if (user) this.store.audit(user.id, user.id, "logout", this.now());
    }
  }
  async createUser(
    token: string | undefined,
    input: unknown,
    password: unknown,
  ) {
    this.requireAdmin(token);
    const fields = validateUser(input);
    if (typeof password !== "string")
      throw new AuthError("Informe uma senha inicial.");
    const passwordHash = await hashPassword(password);
    return this.store.transaction(() => {
      const actor = this.requireAdmin(token);
      if (this.store.findUser(fields.email))
        throw new AuthError("Já existe um usuário com este e-mail.", 409);
      const user = {
        ...fields,
        id: randomUUID(),
        passwordHash,
        createdAt: this.now(),
        lastLoginAt: null,
      };
      this.store.insertUser(user);
      this.store.audit(actor.id, user.id, "user.create", this.now());
      return publicUser(user);
    });
  }
  updateUser(token: string | undefined, id: string, input: unknown) {
    this.requireAdmin(token);
    const fields = validateUser(input);
    return this.store.transaction(() => {
      const actor = this.requireAdmin(token);
      const old = this.store.getUser(id);
      if (!old) throw new AuthError("Usuário não encontrado.", 404);
      const duplicate = this.store.findUser(fields.email);
      if (duplicate && duplicate.id !== id)
        throw new AuthError("Já existe um usuário com este e-mail.", 409);
      if (
        old.active &&
        old.role === "admin" &&
        (!fields.active || fields.role !== "admin") &&
        this.store.activeAdmins() <= 1
      )
        throw new AuthError("Mantenha pelo menos um administrador ativo.", 409);
      const next = { ...old, ...fields };
      this.store.updateUser(next);
      if (
        old.email !== next.email ||
        old.role !== next.role ||
        old.active !== next.active
      )
        this.store.revokeSessions(id);
      this.store.audit(actor.id, id, "user.update", this.now());
      return publicUser(next);
    });
  }
  async resetPassword(
    token: string | undefined,
    id: string,
    password: unknown,
  ) {
    this.requireAdmin(token);
    if (typeof password !== "string")
      throw new AuthError("Informe a nova senha.");
    const passwordHash = await hashPassword(password);
    this.store.transaction(() => {
      const actor = this.requireAdmin(token);
      const user = this.store.getUser(id);
      if (!user) throw new AuthError("Usuário não encontrado.", 404);
      this.store.updateUser({ ...user, passwordHash });
      this.store.revokeSessions(id);
      this.store.clearAttempts(tokenHash(user.email));
      this.store.audit(actor.id, id, "user.password_reset", this.now());
    });
  }
  async seedAdmin(input: unknown, password: unknown) {
    const fields = validateUser(input);
    if (fields.role !== "admin" || !fields.active)
      throw new AuthError("O seed exige um administrador ativo.");
    if (typeof password !== "string")
      throw new AuthError("Defina SEED_ADMIN_PASSWORD no ambiente.");
    const passwordHash = await hashPassword(password);
    return this.store.transaction(() => {
      if (this.store.listUsers().length) return false;
      const user = {
        ...fields,
        id: randomUUID(),
        passwordHash,
        createdAt: this.now(),
        lastLoginAt: null,
      };
      this.store.insertUser(user);
      this.store.audit(null, user.id, "seed.admin", this.now());
      return true;
    });
  }
}

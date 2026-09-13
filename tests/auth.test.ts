import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { SqliteAuthStore } from "../src/data/auth-sqlite";
import { AuthService, SESSION_SECONDS, tokenHash } from "../src/auth/service";
import { hashPassword, verifyPassword } from "../src/auth/password";
import { AuthError } from "../src/auth/errors";
import { cookieOptions, authOrigin } from "../src/auth/config";
const password = () => randomBytes(24).toString("base64url");
const adminFields = {
  name: "Admin de teste",
  email: "admin@example.test",
  role: "admin",
  active: true,
};
const managerFields = {
  name: "Gestor de teste",
  email: "manager@example.test",
  role: "manager",
  active: true,
};
const status = (code: number) => (error: unknown) =>
  error instanceof AuthError && error.status === code;
async function fixture() {
  const store = new SqliteAuthStore(":memory:");
  const service = new AuthService(store);
  const secret = password();
  await service.seedAdmin(adminFields, secret);
  const session = await service.login(adminFields.email, secret);
  return { store, service, secret, token: session.token };
}
test("hash scrypt com salt aleatório, senha incorreta rejeitada e política aplicada", async () => {
  const secret = password();
  const a = await hashPassword(secret);
  const b = await hashPassword(secret);
  assert.ok(a !== b && !a.includes(secret));
  assert.equal(await verifyPassword(secret, a), true);
  assert.equal(await verifyPassword(password(), a), false);
  assert.equal(await verifyPassword(secret, "invalid"), false);
  await assert.rejects(hashPassword("curta"), status(400));
});
test("login correto, e-mail normalizado, erro genérico e usuário inativo", async () => {
  const { store, service, secret, token } = await fixture();
  try {
    const session = await service.login("  ADMIN@EXAMPLE.TEST ", secret);
    assert.equal(service.currentUser(session.token)?.role, "admin");
    assert.ok(store.findUser(adminFields.email)?.lastLoginAt);
    assert.ok(store.getSession(tokenHash(session.token)));
    assert.equal(store.getSession(session.token), undefined);
    await assert.rejects(
      service.login(adminFields.email, password()),
      status(401),
    );
    await assert.rejects(
      service.login("absent@example.test", secret),
      status(401),
    );
    const managerSecret = password();
    await service.createUser(
      token,
      { ...managerFields, active: false },
      managerSecret,
    );
    await assert.rejects(
      service.login(managerFields.email, managerSecret),
      status(401),
    );
  } finally {
    store.close();
  }
});
test("gestor e visitante não podem consultar ou modificar usuários por nenhuma operação", async () => {
  const { store, service, token } = await fixture();
  try {
    const secret = password();
    const manager = await service.createUser(token, managerFields, secret);
    const session = await service.login(managerFields.email, secret);
    assert.equal(service.requireUser(session.token).role, "manager");
    assert.throws(() => service.listUsers(session.token), status(403));
    assert.throws(() => service.listUsers(), status(401));
    await assert.rejects(
      service.createUser(session.token, adminFields, password()),
      status(403),
    );
    assert.throws(
      () =>
        service.updateUser(session.token, manager.id, {
          ...managerFields,
          role: "admin",
        }),
      status(403),
    );
    await assert.rejects(
      service.resetPassword(session.token, manager.id, password()),
      status(403),
    );
    assert.equal(service.listUsers(token).length, 2);
    assert.ok(
      !JSON.stringify(service.listUsers(token)).includes("passwordHash"),
    );
  } finally {
    store.close();
  }
});
test("desativação, mudança de perfil e troca de senha revogam sessões existentes", async () => {
  const { store, service, token } = await fixture();
  try {
    const secret = password();
    const manager = await service.createUser(token, managerFields, secret);
    const old = await service.login(managerFields.email, secret);
    service.updateUser(token, manager.id, { ...managerFields, active: false });
    assert.equal(service.currentUser(old.token), null);
    service.updateUser(token, manager.id, managerFields);
    const second = await service.login(managerFields.email, secret);
    service.updateUser(token, manager.id, { ...managerFields, role: "admin" });
    assert.equal(service.currentUser(second.token), null);
    const third = await service.login(managerFields.email, secret);
    const replacement = password();
    await service.resetPassword(token, manager.id, replacement);
    assert.equal(service.currentUser(third.token), null);
    await assert.rejects(
      service.login(managerFields.email, secret),
      status(401),
    );
    assert.equal(
      (await service.login(managerFields.email, replacement)).user.role,
      "admin",
    );
  } finally {
    store.close();
  }
});
test("último administrador não pode ser desativado ou rebaixado; duplicidade e seed são seguros", async () => {
  const { store, service, token } = await fixture();
  try {
    const admin = service.requireAdmin(token);
    assert.throws(
      () =>
        service.updateUser(token, admin.id, { ...adminFields, active: false }),
      status(409),
    );
    assert.throws(
      () =>
        service.updateUser(token, admin.id, {
          ...adminFields,
          role: "manager",
        }),
      status(409),
    );
    await assert.rejects(
      service.createUser(token, adminFields, password()),
      status(409),
    );
    assert.equal(await service.seedAdmin(adminFields, password()), false);
    assert.equal(service.listUsers(token).length, 1);
    assert.equal(service.requireAdmin(token).active, true);
  } finally {
    store.close();
  }
});
test("logout, expiração e tokens forjados bloqueiam acesso", async () => {
  const { store, service, token } = await fixture();
  try {
    const expired = new AuthService(
      store,
      () => Date.now() + (SESSION_SECONDS + 1) * 1000,
    );
    assert.equal(expired.currentUser(token), null);
    assert.equal(service.currentUser("forged"), null);
    service.logout(token);
    assert.equal(service.currentUser(token), null);
    service.logout(token);
  } finally {
    store.close();
  }
});
test("tentativas persistidas limitam força bruta e a janela expira", async () => {
  const { store, token } = await fixture();
  let now = Date.now();
  const service = new AuthService(store, () => now);
  try {
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        service.login("unknown@example.test", password()),
        status(401),
      );
    await assert.rejects(
      service.login("unknown@example.test", password()),
      status(429),
    );
    now += 16 * 60 * 1000;
    await assert.rejects(
      service.login("unknown@example.test", password()),
      status(401),
    );
    assert.equal(service.requireAdmin(token).role, "admin");
  } finally {
    store.close();
  }
});
test("cookie HttpOnly/SameSite e HTTPS obrigatório fora de localhost", () => {
  const previous = process.env.APP_ORIGIN;
  try {
    process.env.APP_ORIGIN = "https://traffic.example.test";
    assert.equal(cookieOptions().secure, true);
    assert.equal(cookieOptions().httpOnly, true);
    assert.equal(cookieOptions().sameSite, "strict");
    process.env.APP_ORIGIN = "http://localhost:3000";
    assert.equal(cookieOptions().secure, false);
    process.env.APP_ORIGIN = "http://public.example.test";
    assert.throws(authOrigin);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

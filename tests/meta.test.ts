import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { SqliteAuthStore } from "../src/data/auth-sqlite";
import { SqliteWorkspaceStore } from "../src/data/workspace-sqlite";
import { SqliteMetaRepository } from "../src/data/meta-sqlite";
import { AuthService } from "../src/auth/service";
import { WorkspaceService } from "../src/workspaces/service";
import { MetaService, dataMode } from "../src/meta/service";
import { GraphClient, MetaApiError } from "../src/meta/client";
import {
  TokenVault,
  metaConfig,
  digest,
  type MetaConfig,
} from "../src/meta/security";
import type { MetaProvider } from "../src/meta/types";
import { UrlTrackingService } from "../src/attribution/tracking";
const secret = () => randomBytes(32).toString("base64");
const config: MetaConfig = {
  appId: "123",
  appSecret: secret(),
  key: secret(),
  redirectUri: "https://example.test/api/meta/oauth/callback",
  version: "v26.0",
  scopes: ["ads_read"],
};
test("AES-GCM: segredo protegido, nonce aleatório, tampering e troca de workspace rejeitados", () => {
  const vault = new TokenVault(config.key),
    token = secret(),
    a = vault.seal("one", token),
    b = vault.seal("one", token);
  assert.notEqual(a, b);
  assert.ok(!a.includes(token));
  assert.equal(vault.open("one", a), token);
  assert.throws(() => vault.open("two", a));
  assert.throws(() => vault.open("one", a.slice(0, -8) + "AAAAAAAA"));
  assert.throws(() => new TokenVault("weak"));
});
test("configuração falha fechada: HTTPS, origem, segredo e permissões de leitura", () => {
  assert.throws(() => metaConfig({}));
  const env = {
    APP_ORIGIN: "https://example.test",
    META_APP_ID: config.appId,
    META_APP_SECRET: config.appSecret,
    META_REDIRECT_URI: config.redirectUri,
    TOKEN_ENCRYPTION_KEY: config.key,
  };
  assert.equal(metaConfig(env).version, "v26.0");
  assert.throws(() => metaConfig({ ...env, META_SCOPES: "ads_management" }));
  assert.throws(() =>
    metaConfig({
      ...env,
      META_REDIRECT_URI: "https://other.test/api/meta/oauth/callback",
    }),
  );
});
test("Graph: paginação usa cursor sem seguir URL externa nem vazar token; sanitiza erros", async () => {
  const seen: URL[] = [];
  const token = secret();
  const fake: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    seen.push(url);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      `Bearer ${token}`,
    );
    assert.equal(url.searchParams.get("access_token"), null);
    return Response.json(
      url.searchParams.has("after")
        ? { data: [{ id: "2" }] }
        : {
            data: [{ id: "1" }],
            paging: {
              next: "https://evil.test/?access_token=secret",
              cursors: { after: "cursor" },
            },
          },
    );
  };
  const client = new GraphClient(config, fake);
  assert.equal((await client.list(token, "me/adaccounts")).length, 2);
  assert.ok(seen.every((u) => u.hostname === "graph.facebook.com"));
  await assert.rejects(() => client.get(token, "https://evil.test"));
  const broken = new GraphClient(config, async () =>
    Response.json(
      { error: { code: 190, message: `secret ${token}` } },
      { status: 400 },
    ),
  );
  await assert.rejects(
    () => broken.get(token, "me"),
    (e) =>
      e instanceof MetaApiError &&
      e.category === "token_invalid" &&
      !e.message.includes(token),
  );
});
test("Graph: troca code/long-lived mantém segredos fora da URL e valida expiração", async () => {
  let calls = 0;
  const token = secret();
  const client = new GraphClient(config, async (input, init) => {
    assert.equal(new URL(String(input)).search, "");
    assert.equal(init?.method, "POST");
    const form = init?.body as URLSearchParams;
    assert.equal(form.get("client_secret"), config.appSecret);
    calls++;
    return Response.json(
      calls === 1
        ? { access_token: token }
        : { access_token: token, expires_in: 3600 },
    );
  });
  assert.equal((await client.exchange("code")).token, token);
  assert.equal(calls, 2);
});
test("Meta: OAuth, seleção, persistência, isolamento, sincronização e falhas", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "traffic-meta-")),
    path = join(dir, "test.sqlite"),
    aStore = new SqliteAuthStore(path),
    auth = new AuthService(aStore);
  const password = secret();
  await auth.seedAdmin(
    {
      name: "Admin teste",
      email: "admin@example.test",
      role: "admin",
      active: true,
    },
    password,
  );
  const admin = (await auth.login("admin@example.test", password)).token;
  const wsStore = new SqliteWorkspaceStore(path),
    ws = new WorkspaceService(auth, wsStore),
    store = new SqliteMetaRepository(path);
  const managerPass = secret(),
    managerUser = await auth.createUser(
      admin,
      {
        name: "Gestor teste",
        email: "manager@example.test",
        role: "manager",
        active: true,
      },
      managerPass,
    );
  ws.setMembers(admin, "ws-scale", [managerUser.id]);
  const manager = (await auth.login(managerUser.email, managerPass)).token;
  const accessToken = secret();
  let fail = "",
    calls = 0;
  const mock: MetaProvider = {
    exchange: async () => ({
      token: accessToken,
      expiresAt: Date.now() + 3600000,
    }),
    get: async (_token, path) =>
      path === "me"
        ? { id: "101", name: "Pessoa autorizada" }
        : { id: path, timezone_name: "America/Sao_Paulo" },
    list: async (_token, path, params) => {
      calls++;
      if (fail && path.endsWith("/insights")) throw new MetaApiError(fail);
      if (path === "me/permissions")
        return [{ permission: "ads_read", status: "granted" }];
      if (path === "me/adaccounts")
        return [
          {
            id: "act_123",
            name: "Conta autorizada",
            account_status: 1,
            currency: "BRL",
            timezone_name: "America/Sao_Paulo",
            access_token: "must-not-persist",
          },
        ];
      if (path.endsWith("/campaigns"))
        return [
          { id: "201", name: "Campanha real de teste", status: "ACTIVE" },
        ];
      if (path.endsWith("/adsets"))
        return [{ id: "301", campaign_id: "201", name: "Conjunto teste" }];
      if (path.endsWith("/ads"))
        return [
          {
            id: "401",
            adset_id: "301",
            campaign_id: "201",
            creative: { id: "501" },
          },
        ];
      if (path.endsWith("/adcreatives"))
        return [{ id: "501", name: "Criativo teste" }];
      if (path.endsWith("/insights")) {
        const period = JSON.parse(params!.time_range);
        return [
          {
            ad_id: "401",
            adset_id: "301",
            campaign_id: "201",
            date_start: period.until,
            date_stop: period.until,
            spend: "17.5",
            impressions: "100",
            clicks: "5",
            access_token: "must-not-persist",
          },
        ];
      }
      return [];
    },
  };
  const service = new MetaService(
    auth,
    ws,
    store,
    () => mock,
    () => config,
  );
  try {
    await t.test(
      "sem credenciais: aguarda configuração e mantém demo separado",
      () => {
        const unavailable = new MetaService(
          auth,
          ws,
          store,
          () => mock,
          () => metaConfig({}),
        );
        assert.equal(unavailable.snapshot(admin, "ws-scale").configured, false);
        assert.throws(() => unavailable.begin(admin, "ws-scale"));
        assert.equal(
          dataMode(service.snapshot(admin, "ws-scale").connection),
          "demo",
        );
      },
    );
    await t.test(
      "state de uso único exige cookie, sessão original e validade",
      async () => {
        const flow = service.begin(admin, "ws-scale");
        assert.equal(new URL(flow.url).hostname, "www.facebook.com");
        assert.equal(store.state(digest(flow.state))?.workspaceId, "ws-scale");
        await assert.rejects(() =>
          service.complete(admin, flow.state, "wrong", "code"),
        );
        const admin2 = (await auth.login("admin@example.test", password)).token;
        await assert.rejects(() =>
          service.complete(admin2, flow.state, flow.state, "code"),
        );
        await service.complete(admin, flow.state, flow.state, "code");
        await assert.rejects(() =>
          service.complete(admin, flow.state, flow.state, "code"),
        );
        const expired = service.begin(admin, "ws-scale");
        store.putState(
          digest(expired.state),
          "ws-scale",
          digest(admin),
          Date.now() - 1,
        );
        await assert.rejects(() =>
          service.complete(admin, expired.state, expired.state, "code"),
        );
        assert.ok(!store.credential("ws-scale")?.includes(accessToken));
        assert.equal(
          new TokenVault(config.key).open(
            "ws-scale",
            store.credential("ws-scale")!,
          ),
          accessToken,
        );
      },
    );
    await t.test(
      "gestor só consulta seu workspace, sem credenciais ou logs",
      async () => {
        assert.throws(() => service.snapshot(manager, "ws-loca"));
        assert.throws(() => service.begin(manager, "ws-scale"));
        await assert.rejects(() =>
          service.select(manager, "ws-scale", ["act_123"]),
        );
        await assert.rejects(() => service.sync(manager, "ws-scale"));
        assert.throws(() => service.disconnect(manager, "ws-scale"));
        store.replaceResources("ws-scale", "", "pages", [
          {
            accountId: "",
            kind: "pages",
            id: "9191",
            date: "",
            payload: { name: "Descoberta sem vínculo de conta" },
          },
        ]);
        assert.equal(service.snapshot(manager, "ws-scale").resources.length, 0);
        assert.equal(service.snapshot(admin, "ws-scale").resources.length, 1);
        store.replaceResources("ws-scale", "", "pages", []);
        const snapshot = JSON.stringify(service.snapshot(manager, "ws-scale"));
        assert.ok(!snapshot.includes(accessToken));
        assert.equal(service.snapshot(manager, "ws-scale").events.length, 0);
        assert.equal(service.snapshot(manager, "ws-scale").accounts.length, 0);
      },
    );
    await t.test(
      "seleção valida acesso na API e rejeita IDs injetados",
      async () => {
        await assert.rejects(() =>
          service.select(admin, "ws-scale", ["act_999"]),
        );
        await service.select(admin, "ws-scale", ["act_123"]);
        assert.equal(service.snapshot(manager, "ws-scale").accounts.length, 1);
        assert.ok(
          !JSON.stringify(store.accounts("ws-scale")).includes(
            "must-not-persist",
          ),
        );
      },
    );
    await t.test(
      "sincroniza entidades e diário; repetição idempotente, sem métricas inventadas",
      async () => {
        assert.equal((await service.sync(admin, "ws-scale")).status, "success");
        const resources = store.resources("ws-scale");
        assert.equal(resources.length, 5);
        const insight = resources.find((r) => r.kind === "insights")!.payload;
        assert.equal(insight.spend, "17.5");
        assert.equal(insight.reach, undefined);
        assert.equal(insight.sales, undefined);
        assert.ok(!JSON.stringify(resources).includes("must-not-persist"));
        await service.sync(admin, "ws-scale");
        assert.equal(store.resources("ws-scale").length, 5);
        assert.equal(store.runs("ws-scale").length, 2);
        assert.equal(store.resources("ws-loca").length, 0);
        assert.equal(dataMode(store.connection("ws-scale")), "meta");
      },
    );
    await t.test(
      "falha de API preserva snapshot anterior e registra falha, sem sucesso fictício",
      async () => {
        const previous = JSON.stringify(store.resources("ws-scale"));
        fail = "permission";
        assert.equal((await service.sync(admin, "ws-scale")).status, "failed");
        assert.equal(JSON.stringify(store.resources("ws-scale")), previous);
        assert.ok(
          store
            .runs("ws-scale")[0]!
            .errors.some((e) => e.includes("permission")),
        );
        fail = "";
      },
    );
    await t.test(
      "remoção da seleção oculta dados de conta, preservando histórico",
      async () => {
        await service.select(admin, "ws-scale", []);
        assert.equal(service.snapshot(manager, "ws-scale").resources.length, 0);
        assert.equal(store.resources("ws-scale").length, 5);
        await assert.rejects(() => service.sync(admin, "ws-scale"));
        await service.select(admin, "ws-scale", ["act_123"]);
      },
    );
    await t.test(
      "token inválido exige reconexão; desconectar apaga credencial sem voltar ao demo",
      async () => {
        fail = "token_invalid";
        assert.equal((await service.sync(admin, "ws-scale")).status, "failed");
        const prior = calls;
        await assert.rejects(() => service.sync(admin, "ws-scale"));
        assert.equal(calls, prior);
        service.disconnect(admin, "ws-scale");
        assert.equal(store.credential("ws-scale"), null);
        assert.equal(store.resources("ws-scale").length, 5);
        assert.equal(
          dataMode(service.snapshot(admin, "ws-scale").connection),
          "meta",
        );
      },
    );
  } finally {
    store.close();
    wsStore.close();
    aStore.close();
    const p = resolve(dir);
    if (
      dirname(p) === resolve(tmpdir()) &&
      basename(p).startsWith("traffic-meta-")
    )
      rmSync(p, { recursive: true, force: true });
  }
});
test("tracking preserva URL e codifica UTMs/IDs sem aceitar protocolo executável", () => {
  const tracking = new UrlTrackingService();
  const url = new URL(
    tracking.buildUrl(
      "https://example.test/oferta?x=1&utm_term=antigo",
      { workspaceId: "ws-a", campaignId: "camp-a" },
      { source: "meta", medium: "paid_social", campaign: "ação & venda" },
    ),
  );
  assert.equal(url.searchParams.get("x"), "1");
  assert.equal(url.searchParams.get("traffic_workspace_id"), "ws-a");
  assert.equal(url.searchParams.get("utm_campaign"), "ação & venda");
  assert.equal(url.searchParams.get("utm_term"), null);
  assert.throws(() =>
    tracking.buildUrl(
      "javascript:alert(1)",
      { workspaceId: "w" },
      { source: "a", medium: "b", campaign: "c" },
    ),
  );
});

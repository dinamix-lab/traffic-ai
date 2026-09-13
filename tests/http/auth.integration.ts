import { SqliteCrmRepository } from "../../src/data/crm-sqlite";
import { normalizeEvent, processEvent } from "../../src/crm/processor";
import { SqliteMetaRepository } from "../../src/data/meta-sqlite";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { AuthService } from "../../src/auth/service";
import { SqliteAuthStore } from "../../src/data/auth-sqlite";

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Porta de teste indisponível.");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
test(
  "integração HTTP: seed, login, perfis, CRUD, revogação e logout",
  { timeout: 90000 },
  async (t) => {
    const externalOrigin = process.env.TRAFFIC_TEST_ORIGIN;
    const directory = externalOrigin
      ? resolve(process.env.TRAFFIC_TEST_DIRECTORY!)
      : mkdtempSync(join(tmpdir(), "traffic-ai-auth-"));
    const path = join(directory, "test.sqlite");
    const port = externalOrigin
      ? Number(new URL(externalOrigin).port)
      : await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const adminPassword = randomBytes(24).toString("base64url");
    const managerPassword = randomBytes(24).toString("base64url");
    const env = {
      ...process.env,
      APP_ORIGIN: origin,
      SQLITE_PATH: path,
      SEED_ADMIN_NAME: "Admin HTTP",
      SEED_ADMIN_EMAIL: "admin@example.test",
      SEED_ADMIN_PASSWORD: adminPassword,
      NEXT_TELEMETRY_DISABLED: "1",
      DINAMIX_TRAFFIC_AI_API_KEY: "",
      DINAMIX_CRM_WORKSPACE_SLUG: "scale-digital",
    };
    if (externalOrigin) {
      if (!basename(directory).startsWith("traffic-ai-auth-"))
        throw new Error("Use um diretório isolado de teste.");
      const fixtureStore = new SqliteAuthStore(path);
      try {
        const fixtureAuth = new AuthService(fixtureStore);
        const fields = {
          name: "Admin HTTP",
          email: "admin@example.test",
          role: "admin",
          active: true,
        };
        assert.equal(await fixtureAuth.seedAdmin(fields, adminPassword), true);
        assert.equal(
          await fixtureAuth.seedAdmin(fields, managerPassword),
          false,
        );
      } finally {
        fixtureStore.close();
      }
    } else {
      const seed = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/seed-admin.ts"],
        { env, windowsHide: true, encoding: "utf8" },
      );
      assert.equal(seed.status, 0, "Seed deve concluir sem expor credenciais.");
      const seedAgain = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/seed-admin.ts"],
        {
          env: {
            ...env,
            SEED_ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
          },
          windowsHide: true,
          encoding: "utf8",
        },
      );
      assert.equal(seedAgain.status, 0);
      assert.ok(seedAgain.stdout.includes("Nenhuma senha foi alterada"));
    }
    // Seed-only secrets are not passed to the application process.
    const serverEnv: NodeJS.ProcessEnv = {
      ...process.env,
      APP_ORIGIN: origin,
      SQLITE_PATH: path,
      NEXT_TELEMETRY_DISABLED: "1",
    };
    delete serverEnv.SEED_ADMIN_PASSWORD;
    const child = externalOrigin
      ? null
      : spawn(
          process.execPath,
          [
            "node_modules/next/dist/bin/next",
            "start",
            "-p",
            String(port),
            "--hostname",
            "127.0.0.1",
          ],
          {
            env: serverEnv,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
    child?.stdout?.resume();
    child?.stderr?.resume();
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      cookie = "",
      source = origin,
    ) {
      return fetch(origin + path, {
        method,
        redirect: "manual",
        headers: {
          Origin: source,
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function login(email: string, password: string) {
      const response = await request("/api/auth/login", "POST", {
        email,
        password,
      });
      assert.equal(response.status, 200, "Login deve funcionar.");
      const header = response.headers.get("set-cookie") || "";
      assert.ok(
        header.includes("HttpOnly") && header.includes("SameSite=strict"),
      );
      return header.split(";")[0]!;
    }
    let adminCookie = "";
    let managerCookie = "";
    let managerId = "";
    try {
      let ready = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        try {
          const result = await fetch(origin + "/login");
          if (result.status === 200) {
            ready = true;
            break;
          }
        } catch {}
        if (child && child.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      assert.ok(ready, "Servidor local de teste deve iniciar.");
      await t.test(
        "rotas protegidas sem sessão e login incorreto",
        async () => {
          assert.equal((await request("/api/users")).status, 401);
          const page = await request("/usuarios");
          assert.ok(
            [307, 308].includes(page.status) &&
              page.headers.get("location") === "/login",
          );
          assert.equal(
            (
              await request("/api/auth/login", "POST", {
                email: "admin@example.test",
                password: managerPassword,
              })
            ).status,
            401,
          );
        },
      );
      await t.test(
        "login admin, cookies e respostas sem hash de senha",
        async () => {
          adminCookie = await login("admin@example.test", adminPassword);
          const result = await request(
            "/api/users",
            "GET",
            undefined,
            adminCookie,
          );
          assert.equal(result.status, 200);
          const body = await result.text();
          assert.ok(body.includes("Admin HTTP"));
          assert.ok(
            !body.includes("passwordHash") && !body.includes("scrypt$"),
          );
          assert.equal(result.headers.get("cache-control"), "no-store");
          const page = await request(
            "/usuarios",
            "GET",
            undefined,
            adminCookie,
          );
          assert.equal(page.status, 200);
          assert.ok((await page.text()).includes("Equipe e permissões"));
        },
      );
      await t.test(
        "admin cria gestor e último acesso é registrado",
        async () => {
          const result = await request(
            "/api/users",
            "POST",
            {
              name: "Gestor HTTP",
              email: "manager@example.test",
              role: "manager",
              active: true,
              password: managerPassword,
            },
            adminCookie,
          );
          assert.equal(result.status, 201);
          managerId = (await result.json()).user.id;
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-scale/members",
                "PUT",
                { userIds: [managerId] },
                adminCookie,
              )
            ).status,
            200,
          );
          managerCookie = await login("manager@example.test", managerPassword);
          const users = (
            await (
              await request("/api/users", "GET", undefined, adminCookie)
            ).json()
          ).users as { id: string; lastLoginAt: number | null }[];
          assert.ok(users.find((u) => u.id === managerId)?.lastLoginAt);
        },
      );
      await t.test(
        "gestor acessa as oito áreas e detalhes, sem item administrativo na sidebar",
        async () => {
          for (const path of [
            "/",
            "/campanhas",
            "/traffic-ai",
            "/recomendacoes",
            "/criativos",
            "/metas",
            "/leads",
            "/diario",
            "/campanhas/camp-01",
          ]) {
            const result = await request(path, "GET", undefined, managerCookie);
            assert.equal(result.status, 200, path);
            const html = await result.text();
            assert.ok(!html.includes('href="/usuarios"'), path);
          }
        },
      );
      await t.test(
        "bloqueio de URL e todas as operações administrativas para gestor",
        async () => {
          const page = await request(
            "/usuarios",
            "GET",
            undefined,
            managerCookie,
          );
          const html = await page.text();
          const redirected =
            [307, 308].includes(page.status) &&
            page.headers.get("location") === "/acesso-negado";
          const streamedRedirect =
            page.status === 200 &&
            html.includes("NEXT_REDIRECT") &&
            html.includes("/acesso-negado");
          assert.ok(
            redirected || streamedRedirect,
            "A página deve redirecionar o gestor, inclusive quando o Next já iniciou streaming.",
          );
          assert.ok(
            !html.includes("Equipe e permissões") &&
              !html.includes("admin@example.test"),
            "Nenhum dado administrativo deve ser renderizado.",
          );
          for (const [path, method] of [
            ["/api/users", "GET"],
            ["/api/users", "POST"],
            [`/api/users/${managerId}`, "PATCH"],
            [`/api/users/${managerId}/password`, "POST"],
          ])
            assert.equal(
              (
                await request(
                  path!,
                  method,
                  method === "GET" ? undefined : {},
                  managerCookie,
                )
              ).status,
              403,
            );
        },
      );
      await t.test(
        "CSRF, formatos inválidos e e-mail duplicado são bloqueados",
        async () => {
          assert.equal(
            (
              await request(
                "/api/auth/logout",
                "POST",
                undefined,
                adminCookie,
                "https://evil.example.test",
              )
            ).status,
            403,
          );
          assert.equal(
            (await request("/api/users", "POST", {}, adminCookie)).status,
            400,
          );
          assert.equal(
            (
              await request(
                "/api/users",
                "POST",
                {
                  name: "Duplicado",
                  email: "ADMIN@example.test",
                  role: "manager",
                  active: true,
                  password: managerPassword,
                },
                adminCookie,
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        "workspaces: criar, selecionar e validar contexto no dashboard",
        async () => {
          const created = await request(
            "/api/workspaces",
            "POST",
            {
              name: "Operação HTTP",
              slug: "operacao-http",
              active: true,
              timezone: "America/Sao_Paulo",
              currency: "BRL",
              description: "Isolada",
            },
            adminCookie,
          );
          assert.equal(created.status, 201);
          const select = await request(
            "/api/workspaces/select",
            "POST",
            { workspaceId: "ws-loca" },
            adminCookie,
          );
          assert.equal(select.status, 200);
          const a = await (
            await request("/?workspace=ws-scale", "GET", undefined, adminCookie)
          ).text();
          const b = await (
            await request("/?workspace=ws-loca", "GET", undefined, adminCookie)
          ).text();
          assert.ok(a.includes("Mentoria Scale"));
          assert.ok(b.includes("Mentoria Scale · Loca Easy"));
          assert.notEqual(a, b);
        },
      );
      await t.test(
        "workspaces: gestor só lista vínculos e não acessa URLs nem APIs de outra empresa",
        async () => {
          const list = await (
            await request("/api/workspaces", "GET", undefined, managerCookie)
          ).json();
          assert.deepEqual(
            list.workspaces.map((w: { id: string }) => w.id),
            ["ws-scale"],
          );
          for (const url of [
            "/api/workspaces/ws-loca/integrations",
            "/api/workspaces/ws-loca/goals",
          ])
            assert.equal(
              (await request(url, "GET", undefined, managerCookie)).status,
              403,
            );
          assert.equal(
            (
              await request(
                "/api/workspaces/select",
                "POST",
                { workspaceId: "ws-loca" },
                managerCookie,
              )
            ).status,
            403,
          );
          for (const url of [
            "/?workspace=ws-loca",
            "/campanhas?workspace=ws-loca",
            "/campanhas/camp-01?workspace=ws-loca",
            "/integracoes?workspace=ws-loca",
            "/integracoes/meta/contas?workspace=ws-loca",
          ]) {
            const response = await request(
              url,
              "GET",
              undefined,
              managerCookie,
            );
            const html = await response.text();
            assert.ok(
              response.headers.get("location") === "/acesso-negado" ||
                (html.includes("NEXT_REDIRECT") &&
                  html.includes("/acesso-negado")),
              url,
            );
            assert.ok(!html.includes("Mentoria Scale · Loca Easy"), url);
          }
          for (const url of ["/workspaces", "/workspaces/ws-scale"]) {
            const response = await request(
              url,
              "GET",
              undefined,
              managerCookie,
            );
            const html = await response.text();
            assert.ok(
              response.headers.get("location") === "/acesso-negado" ||
                html.includes("NEXT_REDIRECT"),
            );
          }
          assert.equal(
            (await request("/api/workspaces", "POST", {}, managerCookie))
              .status,
            403,
          );
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-scale/members",
                "PUT",
                { userIds: [] },
                managerCookie,
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "Meta: configuração pendente, gestor somente leitura e rotas antigas aposentadas",
        async () => {
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-scale/integrations",
                "POST",
                { action: "connect" },
                adminCookie,
              )
            ).status,
            410,
          );
          const snapshot = await (
            await request(
              "/api/workspaces/ws-scale/meta",
              "GET",
              undefined,
              managerCookie,
            )
          ).json();
          assert.equal(snapshot.configured, false);
          assert.equal(snapshot.connection, null);
          assert.deepEqual(snapshot.runs, []);
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-scale/meta",
                "POST",
                { action: "connect" },
                adminCookie,
              )
            ).status,
            503,
          );
          for (const action of ["connect", "sync", "disconnect", "select"])
            assert.equal(
              (
                await request(
                  "/api/workspaces/ws-scale/meta",
                  "POST",
                  { action, accountIds: [] },
                  managerCookie,
                )
              ).status,
              403,
            );
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-loca/meta",
                "GET",
                undefined,
                managerCookie,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request("/api/workspaces/ws-scale/meta", "POST", {
                action: "connect",
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-scale/accounts/obsolete",
                "PATCH",
                { workspaceId: "ws-scale", managerIds: [], syncEnabled: false },
                managerCookie,
              )
            ).status,
            403,
          );
        },
      );

      await t.test("metas: gravação isolada por workspace", async () => {
        const goals = (
          await (
            await request(
              "/api/workspaces/ws-scale/goals",
              "GET",
              undefined,
              managerCookie,
            )
          ).json()
        ).goals;
        assert.equal(
          (
            await request(
              "/api/workspaces/ws-scale/goals",
              "PUT",
              { ...goals, maxCpl: 81 },
              managerCookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await (
              await request(
                "/api/workspaces/ws-loca/goals",
                "GET",
                undefined,
                adminCookie,
              )
            ).json()
          ).goals.maxCpl,
          40,
        );
        assert.equal(
          (
            await request(
              "/api/workspaces/ws-loca/goals",
              "PUT",
              goals,
              managerCookie,
            )
          ).status,
          403,
        );
      });
      await t.test(
        "Dados Meta: snapshot real de teste nunca mostra campanhas e métricas demo",
        async () => {
          const fixture = new SqliteMetaRepository(path);
          try {
            fixture.saveConnection(
              {
                workspaceId: "ws-scale",
                revision: "fixture-http",
                connected: true,
                userName: "Meta HTTP fixture",
                userId: "9090",
                expiresAt: Date.now() + 3600000,
                lastSyncAt: Date.now(),
                health: "Fixture isolada de teste",
                permissions: ["ads_read"],
              },
              "fixture-no-live-token",
            );
            fixture.saveAccounts("ws-scale", [
              {
                id: "act_7070",
                name: "Conta fixture HTTP",
                status: 1,
                currency: "BRL",
                timezone: "America/Sao_Paulo",
                business: null,
                selected: true,
              },
            ]);
            fixture.replaceResources("ws-scale", "act_7070", "campaigns", [
              {
                accountId: "act_7070",
                kind: "campaigns",
                id: "8080",
                date: "",
                payload: {
                  id: "8080",
                  name: "Campanha fixture HTTP",
                  status: "ACTIVE",
                },
              },
            ]);
          } finally {
            fixture.close();
          }
          const body = await (
            await request(
              "/?workspace=ws-scale",
              "GET",
              undefined,
              managerCookie,
            )
          ).text();
          assert.match(body, /Dados Meta/);
          assert.match(body, /Campanha fixture HTTP/);
          assert.ok(!body.includes("Conta demo"));
          assert.ok(!body.includes("37.352,59"));
          assert.equal(
            (
              await request(
                "/campanhas/8080?workspace=ws-scale",
                "GET",
                undefined,
                managerCookie,
              )
            ).status,
            200,
          );
          const other = await (
            await request("/?workspace=ws-loca", "GET", undefined, adminCookie)
          ).text();
          assert.match(other, /Dados simulados/);
          assert.ok(!other.includes("Campanha fixture HTTP"));
          const snapshot = JSON.stringify(
            await (
              await request(
                "/api/workspaces/ws-scale/meta",
                "GET",
                undefined,
                managerCookie,
              )
            ).json(),
          );
          assert.ok(!snapshot.includes("fixture-no-live-token"));
          assert.equal(
            (
              await request(
                "/api/meta/oauth/callback?state=invalid&code=test",
                "GET",
              )
            ).status,
            400,
          );
        },
      );

      await t.test(
        "CRM HTTP: sem chave, ações administrativas, cursor privado e isolamento",
        async () => {
          const result = await request(
            "/api/workspaces/ws-scale/crm",
            "GET",
            undefined,
            managerCookie,
          );
          assert.equal(result.status, 200);
          const snapshot = await result.json();
          assert.equal(snapshot.configured, false);
          assert.deepEqual(snapshot.runs, []);
          assert.ok(!("cursor" in snapshot.state));
          assert.ok(!("tenantId" in snapshot.state));
          for (const action of ["health", "sync"])
            assert.equal(
              (
                await request(
                  "/api/workspaces/ws-scale/crm",
                  "POST",
                  { action },
                  managerCookie,
                )
              ).status,
              403,
            );
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-scale/crm",
                "POST",
                { action: "health" },
                adminCookie,
              )
            ).status,
            503,
          );
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-loca/crm",
                "GET",
                undefined,
                managerCookie,
              )
            ).status,
            403,
          );
          assert.equal(
            (await request("/api/workspaces/ws-scale/crm", "GET")).status,
            401,
          );
        },
      );
      await t.test(
        "CRM HTTP: funil e visão geral exibem receita exata sem PII ou dados demo",
        async () => {
          const fixture = new SqliteCrmRepository(path);
          try {
            fixture.transaction(() => {
              for (const [type, id, extra] of [
                ["lead_created", "CRM_HTTP_EVENT_1", {}],
                [
                  "sale_completed",
                  "CRM_HTTP_EVENT_2",
                  { sale_id: "CRM_SALE_1", sale_value: "0.10" },
                ],
                [
                  "sale_completed",
                  "CRM_HTTP_EVENT_3",
                  { sale_id: "CRM_SALE_2", sale_value: "0.20" },
                ],
              ] as const)
                processEvent(
                  fixture,
                  "ws-scale",
                  normalizeEvent({
                    event_id: id,
                    event_type: type,
                    occurred_at: new Date().toISOString(),
                    tenant_id: "private-http-tenant",
                    lead_id: "CRM_HTTP_LEAD",
                    name: "PII_NOT_ALLOWED",
                    ...extra,
                  }),
                );
              fixture.saveState({
                ...fixture.state("ws-scale"),
                cursor: "opaque-private-cursor",
                tenantId: "private-http-tenant",
                lastSuccessAt: Date.now(),
                lastSyncStatus: "success",
                status: "connected",
                totalEvents: 3,
                lastEvents: 3,
              });
            });
          } finally {
            fixture.close();
          }
          const funnel = await (
            await request(
              "/funil?workspace=ws-scale",
              "GET",
              undefined,
              managerCookie,
            )
          ).text();
          assert.match(funnel, /Funil de Receita/);
          assert.match(funnel, /CRM_HTTP_LEAD/);
          assert.match(funnel, /BRL 0,30/);
          assert.ok(!funnel.includes("PII_NOT_ALLOWED"));
          assert.ok(!funnel.includes("opaque-private-cursor"));
          assert.ok(!funnel.includes("private-http-tenant"));
          const root = await (
            await request(
              "/?workspace=ws-scale",
              "GET",
              undefined,
              managerCookie,
            )
          ).text();
          assert.match(root, /Dados Meta \+ CRM/);
          assert.ok(!root.includes("Conta demo"));
          const other = await (
            await request(
              "/funil?workspace=ws-loca",
              "GET",
              undefined,
              adminCookie,
            )
          ).text();
          assert.ok(!other.includes("CRM_HTTP_LEAD"));
        },
      );

      await t.test(
        "Intelligence HTTP: sessão, workspace, CSRF e configurações administrativas",
        async () => {
          const route = "/api/workspaces/ws-scale/intelligence";
          assert.equal((await request(route)).status, 401);
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-dinamix/intelligence",
                "GET",
                undefined,
                managerCookie,
              )
            ).status,
            403,
          );
          const read = await request(route, "GET", undefined, managerCookie);
          assert.equal(read.status, 200);
          const snapshot = await read.json();
          assert.equal(snapshot.config, null);
          assert.ok(!JSON.stringify(snapshot).includes("private-http-cursor"));
          assert.equal(
            (
              await request(
                route,
                "POST",
                { action: "config", values: { minLeads: 10 } },
                managerCookie,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                route,
                "POST",
                { action: "analyze" },
                managerCookie,
                "https://other.test",
              )
            ).status,
            403,
          );
          const forbidden = await request(
            "/intelligence-settings?workspace=ws-scale",
            "GET",
            undefined,
            managerCookie,
          );
          const forbiddenHtml = await forbidden.text();
          assert.ok(
            ([307, 308].includes(forbidden.status) &&
              forbidden.headers.get("location") === "/acesso-negado") ||
              (forbiddenHtml.includes("NEXT_REDIRECT") &&
                forbiddenHtml.includes("/acesso-negado")),
          );
          assert.ok(!forbiddenHtml.includes("Salvar configurações"));
          for (const page of [
            "/traffic-ai",
            "/aprovacoes",
            "/creative-intelligence",
            "/reels",
            "/diario",
          ]) {
            const response = await request(
              page + "?workspace=ws-scale",
              "GET",
              undefined,
              managerCookie,
            );
            assert.equal(response.status, 200);
            assert.ok(
              !(await response.text()).includes('href="/intelligence-settings'),
            );
          }
        },
      );
      await t.test(
        "Intelligence HTTP: gerar, aprovar, rejeitar, diário e demo isolada",
        async () => {
          const route = "/api/workspaces/ws-scale/intelligence";
          assert.equal(
            (
              await request(
                route,
                "POST",
                { action: "analyze", mode: "demo" },
                managerCookie,
              )
            ).status,
            200,
          );
          const snapshot = await (
            await request(route + "?mode=demo", "GET", undefined, managerCookie)
          ).json();
          assert.ok(snapshot.recommendations.length >= 2);
          const first = snapshot.recommendations[0],
            second = snapshot.recommendations[1];
          assert.equal(
            (
              await request(
                route,
                "POST",
                { action: "decide", id: first.id, decision: "approved" },
                managerCookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                route,
                "POST",
                { action: "decide", id: first.id, decision: "approved" },
                managerCookie,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await request(
                route,
                "POST",
                {
                  action: "decide",
                  id: second.id,
                  decision: "rejected",
                  reason: "outro",
                  note: "Registro HTTP",
                },
                managerCookie,
              )
            ).status,
            200,
          );
          const after = await (
            await request(route + "?mode=demo", "GET", undefined, managerCookie)
          ).json();
          assert.equal(after.decisions.length, 2);
          assert.ok(after.journal.length);
          const real = await (
            await request(route, "GET", undefined, managerCookie)
          ).json();
          assert.ok(
            real.recommendations.every(
              (r: { mode: string }) => r.mode === "real",
            ),
          );
          assert.equal(real.metrics.roas.value, null);
        },
      );
      await t.test(
        "Intelligence HTTP: criativo manual, avaliação insuficiente e proposta bloqueada",
        async () => {
          const route = "/api/workspaces/ws-scale/intelligence";
          const response = await request(
            route,
            "POST",
            {
              action: "creative",
              values: {
                title: "Reel HTTP",
                profileId: "perfil-http",
                organic: { views: 2 },
              },
            },
            managerCookie,
          );
          assert.equal(response.status, 200);
          const creative = (await response.json()).result;
          assert.equal(
            (
              await request(
                route,
                "POST",
                { action: "evaluate", id: creative.id },
                managerCookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                route,
                "POST",
                { action: "propose", id: creative.id, type: "GROWTH" },
                managerCookie,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await request(
                "/api/workspaces/ws-dinamix/intelligence",
                "POST",
                { action: "evaluate", id: creative.id },
                adminCookie,
              )
            ).status,
            404,
          );
        },
      );
      await t.test(
        "admin edita, desativa e ativa gestor; sessão antiga permanece inválida",
        async () => {
          const fields = {
            name: "Gestor editado",
            email: "manager@example.test",
            role: "manager",
            active: false,
          };
          assert.equal(
            (
              await request(
                `/api/users/${managerId}`,
                "PATCH",
                fields,
                adminCookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request("/api/auth/login", "POST", {
                email: fields.email,
                password: managerPassword,
              })
            ).status,
            401,
          );
          const page = await request("/", "GET", undefined, managerCookie);
          assert.equal(page.headers.get("location"), "/login");
          assert.equal(
            (
              await request(
                `/api/users/${managerId}`,
                "PATCH",
                { ...fields, active: true },
                adminCookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (await request("/", "GET", undefined, managerCookie)).headers.get(
              "location",
            ),
            "/login",
          );
          managerCookie = await login(fields.email, managerPassword);
        },
      );
      await t.test(
        "redefinição revoga sessão e senha antiga; nova senha funciona",
        async () => {
          const replacement = randomBytes(24).toString("base64url");
          assert.equal(
            (
              await request(
                `/api/users/${managerId}/password`,
                "POST",
                { password: replacement },
                adminCookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (await request("/", "GET", undefined, managerCookie)).headers.get(
              "location",
            ),
            "/login",
          );
          assert.equal(
            (
              await request("/api/auth/login", "POST", {
                email: "manager@example.test",
                password: managerPassword,
              })
            ).status,
            401,
          );
          managerCookie = await login("manager@example.test", replacement);
        },
      );
      await t.test(
        "logout remove cookie e revoga token reutilizado",
        async () => {
          const result = await request(
            "/api/auth/logout",
            "POST",
            undefined,
            adminCookie,
          );
          assert.equal(result.status, 200);
          assert.ok(result.headers.get("set-cookie")?.includes("Max-Age=0"));
          assert.equal(
            (await request("/api/users", "GET", undefined, adminCookie)).status,
            401,
          );
          assert.equal(
            (
              await request(
                "/api/auth/logout",
                "POST",
                undefined,
                managerCookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (await request("/", "GET", undefined, managerCookie)).headers.get(
              "location",
            ),
            "/login",
          );
        },
      );
      await t.test(
        "persistência SQLite mantém os usuários ao reabrir o banco",
        () => {
          const store = new SqliteAuthStore(path);
          try {
            assert.equal(store.listUsers().length, 2);
            assert.equal(store.getUser(managerId)?.name, "Gestor editado");
          } finally {
            store.close();
          }
        },
      );
    } finally {
      if (child && child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
      const absolute = resolve(directory);
      if (
        !externalOrigin &&
        dirname(absolute) === resolve(tmpdir()) &&
        basename(absolute).startsWith("traffic-ai-auth-")
      )
        rmSync(absolute, { recursive: true, force: true });
    }
  },
);

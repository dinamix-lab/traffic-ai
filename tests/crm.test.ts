import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { DinamixClient, CrmError, retryAfter } from "../src/crm/client";
import { decimal, add, divide, preciseJson } from "../src/crm/decimal";
import { normalizeEvent, handlers } from "../src/crm/processor";
import { businessMetrics } from "../src/crm/metrics";
import { attribution, mediaMatch } from "../src/crm/attribution";
import { CrmService } from "../src/crm/service";
import { SqliteCrmRepository } from "../src/data/crm-sqlite";
import { SqliteAuthStore } from "../src/data/auth-sqlite";
import { SqliteWorkspaceStore } from "../src/data/workspace-sqlite";
import { AuthService } from "../src/auth/service";
import { WorkspaceService } from "../src/workspaces/service";
import type { CrmProvider, EventPage } from "../src/crm/types";
import type { MetaSnapshot } from "../src/meta/types";
const key = randomBytes(32).toString("base64url");
const event = (type: string, fields: Record<string, unknown> = {}) => ({
  event_id: randomUUID(),
  event_type: type,
  tenant_id: "tenant-fixture",
  schema_version: "1",
  occurred_at: "2026-09-12T12:00:00.000Z",
  ...fields,
});
test("CRM client e aritmética exata", async (t) => {
  await t.test(
    "health GET autentica somente em header e valida contrato",
    async () => {
      const client = new DinamixClient(key, {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          assert.equal(
            url.href,
            "https://arkom-crm-ia.replit.app/api/traffic-ai/health",
          );
          assert.equal(init?.method, "GET");
          assert.equal(
            new Headers(init?.headers).get("Authorization"),
            `Bearer ${key}`,
          );
          assert.equal(init?.redirect, "error");
          return Response.json({
            status: "ok",
            service: "crm",
            version: "1.0",
          });
        },
      });
      assert.equal((await client.health()).version, "1.0");
    },
  );
  await t.test("auth ausente não faz chamada", async () => {
    let called = false;
    await assert.rejects(
      () =>
        new DinamixClient("", {
          fetch: async () => {
            called = true;
            return Response.json({});
          },
        }).health(),
      (e) => e instanceof CrmError && e.code === "missing_key",
    );
    assert.equal(called, false);
  });
  await t.test(
    "401 não repete nem revela mensagem remota ou chave",
    async () => {
      let count = 0;
      const client = new DinamixClient(key, {
        fetch: async () => {
          count++;
          return Response.json({ error: key }, { status: 401 });
        },
      });
      await assert.rejects(
        () => client.health(),
        (e) =>
          e instanceof CrmError &&
          e.code === "unauthorized" &&
          !e.message.includes(key),
      );
      assert.equal(count, 1);
    },
  );
  await t.test("400 cursor inválido interrompe sem retry", async () => {
    let count = 0;
    const client = new DinamixClient(key, {
      fetch: async () => {
        count++;
        return new Response("", { status: 400 });
      },
    });
    await assert.rejects(
      () => client.events({ cursor: "opaque" }),
      (e) => e instanceof CrmError && e.code === "bad_request",
    );
    assert.equal(count, 1);
  });
  await t.test(
    "since e cursor exclusivos; cursor opaco preservado e página vazia aceita",
    async () => {
      const cursor = "opaque+/=☂";
      const urls: URL[] = [];
      const client = new DinamixClient(key, {
        fetch: async (input) => {
          urls.push(new URL(String(input)));
          return Response.json({
            events: [],
            next_cursor: cursor,
            has_more: false,
          });
        },
      });
      await client.events({ since: "2026-01-01T00:00:00.000Z" });
      await client.events({ cursor });
      assert.equal(urls[0]!.searchParams.get("limit"), "100");
      assert.equal(urls[0]!.searchParams.has("cursor"), false);
      assert.equal(urls[1]!.searchParams.get("cursor"), cursor);
      assert.equal(urls[1]!.searchParams.has("since"), false);
      assert.ok(!urls.some((u) => u.href.includes(key)));
    },
  );
  await t.test("429 respeita Retry-After segundos e data HTTP", async () => {
    let time = 100000,
      count = 0;
    const waits: number[] = [];
    const client = new DinamixClient(key, {
      now: () => time,
      wait: async (ms) => {
        waits.push(ms);
        time += ms;
      },
      fetch: async () =>
        ++count === 1
          ? new Response("", { status: 429, headers: { "Retry-After": "3" } })
          : Response.json({ status: "ok", service: "crm", version: "1.0" }),
    });
    await client.health();
    assert.deepEqual(waits, [3000]);
    assert.equal(retryAfter(new Date(120000).toUTCString(), 100000), 120000);
  });
  await t.test("Retry-After longo adia sem ignorar o limite", async () => {
    let until = 0;
    const client = new DinamixClient(key, {
      now: () => 100000,
      defer: (n) => {
        until = n;
      },
      fetch: async () =>
        new Response("", { status: 429, headers: { "Retry-After": "120" } }),
    });
    await assert.rejects(
      () => client.health(),
      (e) => e instanceof CrmError && e.retryAt === 220000,
    );
    assert.equal(until, 220000);
  });
  for (const status of [500, 502, 503, 504])
    await t.test(`${status}: retries limitados e backoff`, async () => {
      let count = 0;
      const waits: number[] = [];
      const client = new DinamixClient(key, {
        jitter: () => 0,
        wait: async (ms) => {
          waits.push(ms);
        },
        fetch: async () => {
          count++;
          return new Response("", { status });
        },
      });
      await assert.rejects(() => client.health());
      assert.equal(count, 4);
      assert.deepEqual(waits, [500, 1000, 2000]);
    });
  await t.test("timeout/rede aplica backoff sem retry infinito", async () => {
    let count = 0;
    const client = new DinamixClient(key, {
      wait: async () => {},
      fetch: async () => {
        count++;
        throw new Error("timeout " + key);
      },
    });
    await assert.rejects(
      () => client.health(),
      (e) =>
        e instanceof CrmError &&
        e.code === "network" &&
        !e.message.includes(key),
    );
    assert.equal(count, 4);
  });
  await t.test(
    "resposta inválida e cursor ausente com has_more são rejeitados",
    async () => {
      for (const body of [
        { status: "not ok" },
        { events: [], next_cursor: null, has_more: true },
      ]) {
        const client = new DinamixClient(key, {
          fetch: async () => Response.json(body),
        });
        await assert.rejects(() =>
          "events" in body ? client.events({ cursor: "a" }) : client.health(),
        );
      }
    },
  );
  await t.test(
    "valores decimais grandes e fracionários não passam por float",
    () => {
      const data = preciseJson(
        '{"sale_value":1000000000000000.11,"sequence":9007199254740993,"name":"123.45","valid":true}',
      ) as Record<string, string>;
      assert.equal(data.sale_value, "1000000000000000.11");
      assert.equal(data.sequence, "9007199254740993");
      assert.equal(add(data.sale_value!, "0.20"), "1000000000000000.31");
      assert.equal(add("0.1", "0.2"), "0.3");
      assert.equal(divide("10", "3", 2), "3.33");
      assert.equal(divide("10", "0"), null);
      assert.throws(() => decimal(0.1));
    },
  );
  await t.test(
    "whitelist descarta PII e campos opcionais não são exigidos",
    () => {
      const e = normalizeEvent(
        event("lead_created", {
          lead_id: "L",
          email: "private@example.test",
          name: "Privado",
          phone: "123",
          seller_name: "Vendedor permitido",
        }),
      );
      assert.equal(e.email, undefined);
      assert.equal(e.name, undefined);
      assert.equal(e.seller_name, "Vendedor permitido");
      assert.equal(e.utm_campaign, undefined);
      assert.equal(Object.keys(handlers).length, 10);
      assert.throws(() => normalizeEvent(event("lead_disqualified")));
    },
  );
});
test("CRM transações, eventos, lease, atribuição e métricas", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "traffic-crm-")),
    path = join(dir, "app.sqlite"),
    aStore = new SqliteAuthStore(path),
    auth = new AuthService(aStore),
    password = key;
  await auth.seedAdmin(
    {
      name: "Admin CRM",
      email: "crm-admin@example.test",
      active: true,
      role: "admin",
    },
    password,
  );
  const admin = (await auth.login("crm-admin@example.test", password)).token;
  const wsStore = new SqliteWorkspaceStore(path),
    ws = new WorkspaceService(auth, wsStore),
    store = new SqliteCrmRepository(path);
  const managerUser = await auth.createUser(
    admin,
    {
      name: "Gestor CRM",
      email: "crm-manager@example.test",
      role: "manager",
      active: true,
    },
    key,
  );
  ws.setMembers(admin, "ws-scale", [managerUser.id]);
  const manager = (await auth.login(managerUser.email, key)).token;
  let queue: (EventPage | Error)[] = [],
    clock = Date.now();
  const requests: { since?: string; cursor?: string }[] = [];
  const provider: CrmProvider = {
    health: async () => ({ status: "ok", service: "crm", version: "1.0" }),
    events: async (q) => {
      requests.push(q);
      const page = queue.shift();
      if (page instanceof Error) throw page;
      if (!page) throw new Error("missing fixture");
      return page;
    },
  };
  const config = () => ({
    key,
    workspaceSlug: "scale-digital",
    since: "2026-01-01T00:00:00.000Z",
    pollMs: 120000,
    currency: "BRL",
  });
  const service = new CrmService(auth, ws, store, {
    config,
    provider: () => provider,
    now: () => clock,
  });
  service.workerLookup = (slug) => wsStore.list().find((w) => w.slug === slug);
  const sync = async (events: unknown[], cursor: string = randomUUID()) => {
    queue = [{ events, next_cursor: cursor, has_more: false }];
    return service.run(admin, "ws-scale", "sync");
  };
  try {
    await t.test(
      "permissões admin/gestor e vínculo único de workspace",
      async () => {
        await assert.rejects(() => service.run(manager, "ws-scale", "health"));
        await assert.rejects(() => service.run(admin, "ws-loca", "sync"));
        assert.throws(() => service.snapshot(manager, "ws-loca"));
        assert.equal(service.snapshot(manager, "ws-scale").runs.length, 0);
        await service.run(admin, "ws-scale", "health");
        assert.equal(store.state("ws-scale").apiVersion, "1.0");
      },
    );
    const created = event("lead_created", {
      lead_id: "L",
      source: "meta",
      traffic_workspace_id: "ws-scale",
      traffic_campaign_id: "C",
      utm_campaign: "origem",
      seller_id: "S",
    });
    await t.test(
      "primeira sync usa since, drena páginas e confirma cursor vazio",
      async () => {
        queue = [
          { events: [created], next_cursor: "a+/=", has_more: true },
          { events: [], next_cursor: "b+/=", has_more: false },
        ];
        const result = await service.run(admin, "ws-scale", "sync");
        assert.equal(result.busy, false);
        if (!result.busy) {
          assert.equal(result.run.events, 1);
          assert.equal(result.run.pages, 2);
        }
        assert.deepEqual(requests[0], { since: config().since });
        assert.deepEqual(requests[1], { cursor: "a+/=" });
        assert.equal(store.state("ws-scale").cursor, "b+/=");
      },
    );
    await t.test(
      "event_id duplicado é idempotente e nunca volta ao since",
      async () => {
        await sync([created, created], "c");
        assert.equal(store.entities("ws-scale", "leads").length, 1);
        assert.equal(store.state("ws-scale").totalEvents, 1);
        assert.deepEqual(requests.at(-1), { cursor: "b+/=" });
      },
    );
    await t.test(
      "falha no meio da página reverte entidades, eventos e cursor",
      async () => {
        const old = store.state("ws-scale");
        const result = await sync(
          [
            event("lead_created", { lead_id: "ROLLBACK" }),
            event("sale_completed", { lead_id: "ROLLBACK" }),
          ],
          "bad",
        );
        assert.equal(result.busy, false);
        if (!result.busy) assert.equal(result.run.status, "error");
        assert.equal(store.entity("ws-scale", "leads", "ROLLBACK"), null);
        assert.equal(store.state("ws-scale").cursor, old.cursor);
        assert.equal(store.state("ws-scale").totalEvents, old.totalEvents);
      },
    );
    await t.test(
      "retomada usa último commit, sem reiniciar importação",
      async () => {
        await sync([event("lead_created", { lead_id: "RECOVER" })], "resume");
        assert.deepEqual(requests.at(-1), { cursor: "c" });
        assert.ok(store.entity("ws-scale", "leads", "RECOVER"));
      },
    );
    await t.test(
      "tenant divergente ou traffic_workspace_id externo reverte página",
      async () => {
        const cursor = store.state("ws-scale").cursor;
        await sync([
          event("lead_created", { lead_id: "X", tenant_id: "other" }),
        ]);
        assert.equal(store.state("ws-scale").cursor, cursor);
        await sync([
          event("lead_created", {
            lead_id: "X",
            traffic_workspace_id: "ws-loca",
          }),
        ]);
        assert.equal(store.state("ws-scale").cursor, cursor);
        assert.equal(store.entity("ws-scale", "leads", "X"), null);
        assert.equal(store.entities("ws-loca", "leads").length, 0);
      },
    );
    await t.test(
      "reagendar a mesma call atualiza snapshot, não duplica",
      async () => {
        await sync([
          event("call_scheduled", {
            lead_id: "L",
            call_id: "CALL",
            sequence: "2",
            call_scheduled_at: "2026-09-14T12:00:00.000Z",
          }),
          event("call_scheduled", {
            lead_id: "L",
            call_id: "CALL",
            sequence: "3",
            call_scheduled_at: "2026-09-15T12:00:00.000Z",
          }),
        ]);
        assert.equal(store.entities("ws-scale", "calls").length, 1);
        assert.equal(
          store.entity("ws-scale", "calls", "CALL")!.fields.call_scheduled_at,
          "2026-09-15T12:00:00.000Z",
        );
      },
    );
    await t.test(
      "completed, no-show e cancelamento possuem handlers separados",
      async () => {
        await sync([
          event("call_completed", {
            lead_id: "L",
            call_id: "CALL",
            sequence: "4",
            call_ended_at: "2026-09-12T13:00:00.000Z",
          }),
          event("call_no_show", { lead_id: "L", call_id: "NO" }),
          event("call_cancelled", { lead_id: "L", call_id: "CANCEL" }),
        ]);
        assert.equal(
          store.entity("ws-scale", "calls", "CALL")!.fields.call_status,
          "completed",
        );
        assert.equal(
          store.entity("ws-scale", "calls", "NO")!.fields.call_status,
          "no_show",
        );
        assert.equal(
          store.entity("ws-scale", "calls", "CANCEL")!.fields.call_status,
          "cancelled",
        );
      },
    );
    await t.test(
      "evento atrasado não regride status e patch opcional não apaga campos",
      async () => {
        await sync([
          event("call_scheduled", {
            lead_id: "L",
            call_id: "CALL",
            sequence: "1",
          }),
          event("lead_updated", {
            lead_id: "L",
            status: "working",
            utm_campaign: "nao-sobrescrever",
          }),
          event("lead_qualified", { lead_id: "L" }),
        ]);
        assert.equal(
          store.entity("ws-scale", "calls", "CALL")!.fields.call_status,
          "completed",
        );
        assert.equal(
          store.entity("ws-scale", "leads", "L")!.attribution.utm_campaign,
          "origem",
        );
        assert.equal(
          store.entity("ws-scale", "leads", "L")!.fields.seller_id,
          "S",
        );
        assert.ok(store.entity("ws-scale", "leads", "L")!.fields.qualified_at);
      },
    );
    await t.test(
      "várias propostas e vendas por lead, dinheiro exato e duplicata sem receita extra",
      async () => {
        const sale = event("sale_completed", {
          lead_id: "L",
          sale_id: "SALE1",
          sale_value: "0.10",
        });
        await sync([
          event("proposal_created", {
            lead_id: "L",
            proposal_id: "P1",
            proposal_value: "10.01",
          }),
          event("proposal_created", {
            lead_id: "L",
            proposal_id: "P2",
            proposal_value: "20.02",
          }),
          sale,
          event("sale_completed", {
            lead_id: "L",
            sale_id: "SALE2",
            sale_value: "0.20",
          }),
          sale,
        ]);
        assert.equal(store.entities("ws-scale", "proposals").length, 2);
        assert.equal(store.entities("ws-scale", "sales").length, 2);
        const m = businessMetrics(service.snapshot(admin, "ws-scale"), null, {
          from: "2026-09-01",
          to: "2026-09-30",
        });
        assert.equal(m.revenue, "0.3");
        assert.equal(m.sales, 2);
        assert.equal(m.buyers, 1);
        assert.equal(m.showRate, "50");
        assert.equal(m.investment, null);
        assert.equal(m.cac, null);
        assert.equal(m.roas, null);
      },
    );
    await t.test(
      "valores ausentes não são zero e venda sem lead é preservada sem inventar lead",
      async () => {
        await sync([event("sale_completed", { sale_id: "UNKNOWN" })]);
        const m = businessMetrics(service.snapshot(admin, "ws-scale"), null, {
          from: "2026-09-01",
          to: "2026-09-30",
        });
        assert.equal(m.missingValues, 1);
        assert.equal(m.revenue, null);
        assert.equal(m.knownRevenue, "0.3");
        assert.equal(
          store.entity("ws-scale", "sales", "UNKNOWN")!.leadId,
          null,
        );
      },
    );
    await t.test(
      "lead_lost mantém qualificação histórica, sem inventar lead_disqualified",
      async () => {
        await sync([
          event("lead_lost", {
            lead_id: "L",
            loss_reason: "Sem orçamento",
            sequence: "10",
          }),
        ]);
        const lead = store.entity("ws-scale", "leads", "L")!;
        assert.equal(lead.fields.status, "lost");
        assert.ok(lead.fields.qualified_at);
        assert.equal(lead.fields.attribution_status, "exact");
      },
    );
    await t.test(
      "cursor repetido com has_more interrompe, 400 e 401 não avançam",
      async () => {
        const cursor = store.state("ws-scale").cursor;
        queue = [{ events: [], next_cursor: cursor, has_more: true }];
        await service.run(admin, "ws-scale", "sync");
        assert.equal(store.state("ws-scale").cursor, cursor);
        for (const code of ["bad_request", "unauthorized"]) {
          queue = [new CrmError(code)];
          await service.run(admin, "ws-scale", "sync");
          assert.equal(store.state("ws-scale").cursor, cursor);
          assert.equal(store.state("ws-scale").status, "error");
        }
        assert.deepEqual(await service.tick(), { waiting: true });
        await service.run(admin, "ws-scale", "health");
      },
    );
    await t.test(
      "lease durável: outro repositório não adquire até expirar; fence bloqueia dono antigo",
      () => {
        const other = new SqliteCrmRepository(path);
        try {
          assert.ok(store.acquire("ws-scale", "owner-a", clock, 1000));
          assert.equal(
            other.acquire("ws-scale", "owner-b", clock, 1000),
            false,
          );
          clock += 1001;
          assert.ok(other.acquire("ws-scale", "owner-b", clock, 1000));
          assert.throws(() => store.assertLease("ws-scale", "owner-a", clock));
          store.release("ws-scale", "owner-a");
          assert.equal(other.state("ws-scale").leaseOwner, "owner-b");
          other.release("ws-scale", "owner-b");
        } finally {
          other.close();
        }
      },
    );
    await t.test(
      "execução concorrente manual/worker não inicia uma segunda chamada",
      async () => {
        store.acquire("ws-scale", "other", clock, 90000);
        const previous = requests.length;
        const result = await service.run(admin, "ws-scale", "sync");
        assert.equal(result.busy, true);
        assert.equal(requests.length, previous);
        store.release("ws-scale", "other");
      },
    );
    await t.test(
      "cadência HTTP é durável e Retry-After bloqueia novas reservas",
      () => {
        const first = store.reserveRequest(clock),
          next = store.reserveRequest(clock);
        assert.equal(next - first, 1100);
        store.deferRequests(clock + 120000);
        assert.ok(store.reserveRequest(clock) >= clock + 120000);
      },
    );
    await t.test(
      "snapshot não expõe cursor, tenant, chave ou owner ao gestor",
      () => {
        const out = JSON.stringify(service.snapshot(manager, "ws-scale"));
        assert.ok(!out.includes("tenant-fixture"));
        assert.ok(!out.includes(key));
        assert.ok(!out.includes("leaseOwner"));
        assert.equal(service.snapshot(manager, "ws-scale").runs.length, 0);
        assert.equal(
          service.snapshot(manager, "ws-scale").state.hasCursor,
          true,
        );
      },
    );
    await t.test(
      "atribuição por evidência: traffic, meta, UTM, source e desconhecido",
      () => {
        for (const [a, status, method] of [
          [{ traffic_ad_id: "AD" }, "exact", "traffic_ids"],
          [{ meta_ad_id: "AD" }, "strong", "meta_ids"],
          [{ utm_campaign: "C" }, "partial", "utm"],
          [{ source: "organic" }, "partial", "source"],
          [{}, "unattributed", "unknown"],
        ] as const)
          assert.deepEqual(attribution({ attribution: a }), { status, method });
      },
    );
    await t.test(
      "mídia exige IDs existentes e moeda/fuso compatíveis; vendedor não recebe rateio",
      async () => {
        await sync([]);
        const m: MetaSnapshot = {
          configured: true,
          configurationMessage: "fixture",
          connection: {
            workspaceId: "ws-scale",
            revision: "r",
            connected: true,
            userName: "fixture",
            userId: "u",
            expiresAt: clock + 1000,
            lastSyncAt: clock,
            health: "fixture",
            permissions: [],
          },
          accounts: [
            {
              id: "act_1",
              name: "fixture",
              selected: true,
              status: 1,
              currency: "BRL",
              timezone: "UTC",
              business: null,
            },
          ],
          resources: [
            {
              kind: "campaigns",
              accountId: "act_1",
              id: "C",
              date: "",
              payload: { id: "C" },
            },
            {
              kind: "insights",
              accountId: "act_1",
              id: "AD",
              date: "2026-09-12",
              payload: { ad_id: "AD", campaign_id: "C", spend: "10.00" },
            },
          ],
          runs: [],
          events: [],
        };
        const data = service.snapshot(admin, "ws-scale");
        const metric = businessMetrics(data, m, {
          from: "2026-09-01",
          to: "2026-09-30",
          campaign: "traffic:C",
        });
        assert.equal(metric.investment, "10");
        assert.equal(metric.attributedRevenue, "0.3");
        assert.equal(metric.roas, "0.03");
        assert.equal(metric.cac, "10");
        assert.equal(
          businessMetrics(data, m, {
            from: "2026-09-01",
            to: "2026-09-30",
            seller: "S",
          }).cac,
          null,
        );
        m.accounts[0]!.currency = "USD";
        assert.equal(
          businessMetrics(data, m, { from: "2026-09-01", to: "2026-09-30" })
            .roas,
          null,
        );
        assert.deepEqual(
          mediaMatch(
            { ...data.leads[0]!, attribution: { utm_campaign: "C" } },
            m,
          ),
          [],
        );
      },
    );
    await t.test(
      "filtros comerciais excluem evidência sem correspondência",
      () => {
        const data = service.snapshot(admin, "ws-scale");
        const reassigned = structuredClone(data);
        for (const lead of reassigned.leads)
          lead.fields.seller_id = "old-seller";
        for (const sale of reassigned.sales)
          sale.fields.seller_id = "sale-seller";
        const sellerMetrics = businessMetrics(reassigned, null, {
          from: "2026-09-01",
          to: "2026-09-30",
          seller: "sale-seller",
        });
        assert.equal(sellerMetrics.leads, 0);
        assert.equal(sellerMetrics.sales, reassigned.sales.length);
        assert.equal(
          businessMetrics(data, null, {
            from: "2026-09-01",
            to: "2026-09-30",
            campaign: "traffic:inexistente",
          }).sales,
          0,
        );
        assert.equal(
          businessMetrics(data, null, { from: "2025-01-01", to: "2025-01-31" })
            .sales,
          0,
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
      basename(p).startsWith("traffic-crm-")
    )
      rmSync(p, { recursive: true, force: true });
  }
});

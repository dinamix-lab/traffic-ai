import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import {
  analyze,
  confidence,
  sufficiency,
  guardrails,
  trafficHealth,
} from "../src/intelligence/engine";
import { defaults, validateConfig } from "../src/intelligence/config";
import { demoInputs } from "../src/intelligence/demo";
import { metric, periods, relative, trend } from "../src/intelligence/math";
import {
  organicScore,
  businessScore,
  blankScore,
  emptyOrganic,
  transition,
  patterns,
} from "../src/intelligence/creative";
import type {
  AnalysisInput,
  Creative,
  MetricKey,
} from "../src/intelligence/types";
import { sourceMetrics, type DataSources } from "../src/intelligence/sources";
import { LocalNarrator } from "../src/intelligence/narrator";
import { SqliteAuthStore } from "../src/data/auth-sqlite";
import { SqliteWorkspaceStore } from "../src/data/workspace-sqlite";
import { SqliteIntelligenceRepository } from "../src/data/intelligence-sqlite";
import { AuthService } from "../src/auth/service";
import { WorkspaceService } from "../src/workspaces/service";
import { IntelligenceService } from "../src/intelligence/service";
const now = Date.parse("2026-09-13T20:00:00Z");
function input(
  changes: Partial<Record<MetricKey, string | null>> = {},
): AnalysisInput {
  const i = demoInputs("ws-scale", now, "UTC")[0]!;
  i.mode = "real";
  i.entityId = "ws-scale";
  i.current = structuredClone(i.previous);
  for (const m of [i.current, i.previous])
    for (const v of Object.values(m)) v.source = "real";
  for (const [k, v] of Object.entries(changes))
    i.current[k as MetricKey] = metric(k as MetricKey, v);
  i.limitations = [];
  return i;
}
function reel(id: string, index = 0): Creative {
  return {
    id,
    workspaceId: "ws-scale",
    title: id,
    profileId: "profile-A",
    platform: "instagram",
    mediaType: "reel",
    publicationId: id,
    publishedAt: new Date(now - (3 + index) * 86400000).toISOString(),
    organicAsOf: new Date(now - (1 + index) * 86400000).toISOString(),
    caption: "",
    duration: 30,
    thumbnail: null,
    tags: [],
    hook: "dinheiro",
    angle: "produto",
    theme: "",
    format: "talking head",
    presenter: "",
    cta: "seguir",
    status: "organic_observation",
    source: "manual",
    trafficCreativeId: null,
    metaCreativeId: null,
    organic: {
      ...emptyOrganic(),
      views: 1000,
      retention: 50,
      shares: 20,
      saves: 10,
      profileVisits: 10,
      followers: 5,
    },
    organicScore: blankScore(),
    businessScore: blankScore(),
    business: null,
    paid: null,
    confidence: 0,
    recommendation: "",
    evaluatedAt: null,
    timeline: [],
  };
}
function sources(): DataSources {
  const at = "2026-09-12T12:00:00.000Z";
  return {
    name: "Workspace de teste",
    timezone: "UTC",
    initialSince: "2026-01-01T00:00:00.000Z",
    meta: null,
    crm: {
      configured: true,
      bound: true,
      currency: "BRL",
      state: {
        integrationName: "dinamix-vendas",
        hasCursor: true,
        status: "connected",
        lastHealthAt: now,
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastSyncStatus: "success",
        lastError: null,
        apiVersion: "1.0",
        totalEvents: 1,
        lastEvents: 1,
        nextAttemptAt: 0,
      },
      runs: [],
      leads: Array.from({ length: 100 }, (_, x) => ({
        id: `lead-${x}`,
        leadId: `lead-${x}`,
        fields: { created_at: at, qualified_at: x < 50 ? at : null },
        versions: {},
        attribution: {},
        originAt: at,
        lastEventId: `event-${x}`,
      })),
      calls: [],
      proposals: [],
      sales: [],
    },
  };
}
test("Intelligence: evidência, suficiência, regras, guardrails e scores", async (t) => {
  await t.test(
    "amostra insuficiente obriga WAIT_FOR_DATA e confiança baixa",
    () => {
      const i = input({ leads: "2", clicks: "10", spend: "43" });
      const r = analyze(i, defaults);
      assert.equal(r.type, "WAIT_FOR_DATA");
      assert.equal(r.dataSufficiency, "INSUFFICIENT");
      assert.ok(r.confidenceScore < 30);
    },
  );
  await t.test(
    "amostra forte com sinais concordantes admite confiança alta",
    () => {
      const i = input();
      assert.equal(sufficiency(i, defaults), "STRONG");
      assert.ok(confidence(i, defaults, "STRONG", 4, 0).score >= 85);
    },
  );
  await t.test("janela curta não autoriza confiança alta", () => {
    const i = input();
    i.period.days = 1;
    const r = analyze(i, defaults);
    assert.equal(r.type, "WAIT_FOR_DATA");
    assert.ok(r.confidenceScore < 30);
  });
  await t.test("conflitos reduzem confiança", () => {
    const i = input();
    assert.ok(
      confidence(i, defaults, "STRONG", 4, 2).score <
        confidence(i, defaults, "STRONG", 4, 0).score,
    );
  });
  await t.test("CPL pior com qualidade melhor mantém estratégia", () => {
    const r = analyze(input({ cpl: "14", qualificationRate: "75" }), defaults);
    assert.equal(r.type, "MAINTAIN");
    assert.ok(r.conflicts.length);
    assert.ok(r.evidence.some((e) => e.metric === "qualificationRate"));
  });
  await t.test("show rate identifica gargalo comercial", () => {
    const r = analyze(
      input({ showRate: "35", completed: "10", noShows: "20" }),
      defaults,
    );
    assert.equal(r.type, "INVESTIGATE_SALES_PROCESS");
    assert.equal(r.bottleneck, "SHOW_RATE");
  });
  await t.test("landing page exige cliques e comparação de mídia", () => {
    const r = analyze(input({ clickLeadRate: "0.5" }), defaults);
    assert.equal(r.type, "INVESTIGATE_LANDING_PAGE");
    assert.match(r.probableCause, /não há prova/);
  });
  await t.test("sem conversão clique lead conhecida não diagnostica LP", () => {
    assert.notEqual(
      analyze(input({ clickLeadRate: null }), defaults).type,
      "INVESTIGATE_LANDING_PAGE",
    );
  });
  await t.test("fadiga criativa combina CTR CPM e frequência", () => {
    const r = analyze(input({ ctr: "1.2", frequency: "4" }), defaults);
    assert.equal(r.rule, "creative-fatigue");
    assert.equal(r.type, "TEST_NEW_CREATIVE");
    assert.ok(r.evidence.length >= 3);
  });
  await t.test("CPM deteriorando gera hipótese de mídia", () => {
    assert.equal(analyze(input({ cpm: "15" }), defaults).bottleneck, "MEDIA");
  });
  await t.test("oportunidade de escala usa ROAS CAC e vendas com alvo", () => {
    const r = analyze(input({ roas: "6", cac: "80" }), {
      ...defaults,
      roasTarget: "4",
      cacTarget: "100",
    });
    assert.equal(r.type, "SCALE");
    assert.ok(r.confidenceScore >= 65);
  });
  await t.test("escala retida com atribuição parcial", () => {
    const i = input({ roas: "6", cac: "80" });
    i.coverage.attribution = 43;
    const r = analyze(i, { ...defaults, roasTarget: "4", cacTarget: "100" });
    assert.equal(r.type, "WAIT_FOR_DATA");
    assert.ok(r.blockedBy.length);
  });
  await t.test("pausa proibida com amostra insuficiente", () => {
    assert.ok(
      guardrails(
        input({ leads: "1", sales: "0" }),
        defaults,
        "PAUSE",
        "INSUFFICIENT",
        20,
      ).length,
    );
  });
  await t.test("fase de aprendizado bloqueia escala", () => {
    const i = input({ roas: "6" });
    i.learning = true;
    assert.equal(
      analyze(i, { ...defaults, roasTarget: "4" }).type,
      "WAIT_FOR_DATA",
    );
  });
  await t.test("mudança recente bloqueia nova alteração financeira", () => {
    const i = input({ roas: "6" });
    i.lastChangedAt = now - 3600000;
    assert.equal(
      analyze(i, { ...defaults, roasTarget: "4" }).type,
      "WAIT_FOR_DATA",
    );
  });
  await t.test("zero não é desconhecido", () => {
    assert.equal(metric("sales", 0).value, "0");
    assert.equal(metric("sales", null).value, null);
    assert.equal(relative("0", "10"), -100);
    assert.equal(relative("10", "0"), null);
  });
  await t.test("fontes ausentes não fabricam números", () => {
    const s = sources();
    s.crm.state.lastSuccessAt = null;
    const m = sourceMetrics(
      s,
      periods("7", now, "UTC").current,
      "workspace",
      "ws-scale",
    );
    assert.equal(m.metrics.sales.value, null);
    assert.equal(m.metrics.spend.value, null);
  });
  await t.test(
    "CRM conectado sem vendas registra zero e mídia permanece desconhecida",
    () => {
      const m = sourceMetrics(
        sources(),
        periods("7", now, "UTC").current,
        "workspace",
        "ws-scale",
      );
      assert.equal(m.metrics.sales.value, "0");
      assert.equal(m.metrics.roas.value, null);
      assert.equal(m.coverage.meta, null);
      assert.equal(m.coverage.crm, 100);
    },
  );
  await t.test("CRM real + mídia simulada nunca produz ROAS real", () => {
    const i = input();
    i.current.spend.source = "demo";
    i.current.roas = metric("roas", "5", "real");
    const r = analyze(i, defaults);
    assert.equal(r.before.roas.value, null);
    assert.equal(r.before.cac.value, null);
    assert.equal(r.before.revenue.value, "5000");
    assert.equal(r.coverage.meta, null);
  });
  await t.test("janela anterior não sobrepõe atual e respeita fuso", () => {
    for (const w of ["today", "yesterday", "3", "7", "14", "30"] as const) {
      const p = periods(w, now, "America/Sao_Paulo");
      assert.ok(p.previous.to < p.current.from);
      assert.equal(p.current.days, p.previous.days);
    }
    assert.equal(
      periods("today", Date.parse("2026-09-13T01:00:00Z"), "America/Sao_Paulo")
        .current.from,
      "2026-09-12",
    );
  });
  await t.test("tendências, média móvel e aceleração sem NaN", () => {
    assert.equal(trend([1, 2, 3, 4]).movingAverage, 3);
    assert.equal(trend([1, 2, 3, 4]).slope, 1);
    assert.equal(trend([null, 1]).volatility, null);
  });
  await t.test("dinheiro muito grande mantém mudança percentual exata", () => {
    assert.equal(relative("9007199254740993.30", "9007199254740993.30"), 0);
  });
  await t.test("Traffic Health explicita componentes ausentes", () => {
    const i = input();
    i.coverage.meta = null;
    const h = trafficHealth(i);
    assert.equal(h.components[0]!.score, null);
    assert.match(h.note, /Não é ROAS/);
  });
  await t.test("narrador local usa resultados existentes", () => {
    const text = new LocalNarrator().summarize({
      workspace: "Teste",
      recommendations: [analyze(input({ leads: "1", clicks: "1" }), defaults)],
    });
    assert.match(text, /1 análises aguardando/);
  });
  await t.test("Organic Score exige amostra e janela", () => {
    const r = reel("new");
    r.organic.views = 2;
    assert.equal(organicScore(r, [], defaults, now).value, null);
    r.organic.views = 1000;
    r.organicAsOf = r.publishedAt;
    assert.equal(organicScore(r, [], defaults, now).value, null);
  });
  await t.test("Organic Score relativo ao próprio perfil", () => {
    const r = reel("new"),
      history = Array.from({ length: 6 }, (_, i) => reel(`old-${i}`, i + 1));
    r.organic.shares = 40;
    r.organic.retention = 100;
    const s = organicScore(r, history, defaults, now);
    assert.ok(s.value !== null && s.value > 50);
    assert.equal(s.components.length, 5);
  });
  await t.test(
    "histórico de outro perfil/workspace não gera Organic Score",
    () => {
      const r = reel("new"),
        history = Array.from({ length: 6 }, (_, i) => ({
          ...reel(`old-${i}`, i + 1),
          workspaceId: "outro",
        }));
      assert.equal(organicScore(r, history, defaults, now).value, null);
    },
  );
  await t.test("Business Score não reaproveita score orgânico", () => {
    assert.equal(businessScore(null, [], defaults).value, null);
    const m = input().current;
    const s = businessScore(
      m,
      Array.from({ length: 5 }, () => structuredClone(m)),
      defaults,
    );
    assert.equal(s.value, 50);
  });
  await t.test("Reel state machine impede saltos e execução falsa", () => {
    const r = reel("r");
    assert.throws(() => transition(r, "paid_testing", "u", now, ""));
    transition(r, "organic_evaluated", "u", now, "");
    transition(r, "test_proposed", "u", now, "");
    transition(r, "test_approved", "u", now, "");
    transition(r, "paid_test_pending", "u", now, "");
    assert.throws(() => transition(r, "paid_testing", "u", now, ""));
    assert.equal(r.status, "paid_test_pending");
  });
  await t.test("padrões fracos são hipóteses", () => {
    const a = reel("a"),
      b = reel("b");
    a.business = input().current;
    b.business = input().current;
    b.hook = "prova";
    assert.ok(
      patterns([a, b], defaults).every(
        (p) => p.status === "hypothesis" && p.confidence < 50,
      ),
    );
  });
  await t.test(
    "configuração rejeita targets inválidos e valida limites",
    () => {
      assert.throws(() => validateConfig({ minLeads: -1 }, defaults));
      assert.throws(() => validateConfig({ cacTarget: "abc" }, defaults));
      assert.throws(() =>
        validateConfig({ landingPage: "javascript:alert(1)" }, defaults),
      );
      assert.equal(
        validateConfig({ testBudgetGrowth: "0.10" }, defaults).testBudgetGrowth,
        "0.1",
      );
    },
  );
});
test("Intelligence: persistência, workflow, auditoria, workspace e laboratório", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "traffic-intelligence-")),
    path = join(dir, "test.sqlite"),
    aStore = new SqliteAuthStore(path),
    auth = new AuthService(aStore),
    wsStore = new SqliteWorkspaceStore(path),
    ws = new WorkspaceService(auth, wsStore),
    store = new SqliteIntelligenceRepository(path),
    password = randomBytes(24).toString("base64url");
  await auth.seedAdmin(
    { name: "Admin", email: "admin@intel.test", role: "admin", active: true },
    password,
  );
  const admin = (await auth.login("admin@intel.test", password)).token;
  const managerUser = await auth.createUser(
    admin,
    {
      name: "Gestor",
      email: "manager@intel.test",
      role: "manager",
      active: true,
    },
    password,
  );
  ws.setMembers(admin, "ws-scale", [managerUser.id]);
  const manager = (await auth.login(managerUser.email, password)).token;
  let clock = now;
  const source = sources();
  const service = new IntelligenceService(
    auth,
    ws,
    store,
    () => source,
    () => clock,
  );
  try {
    await t.test("leitura e ações exigem sessão e workspace", () => {
      assert.throws(() => service.snapshot(undefined, "ws-scale"));
      assert.throws(() => service.snapshot(manager, "ws-dinamix"));
      assert.throws(() => service.generate(manager, "ws-dinamix", "real"));
      assert.equal(service.snapshot(manager, "ws-scale").role, "manager");
    });
    await t.test("gestor não vê nem altera configuração administrativa", () => {
      assert.equal(service.snapshot(manager, "ws-scale").config, null);
      assert.throws(() =>
        service.configure(manager, "ws-scale", { minLeads: 10 }),
      );
      service.configure(admin, "ws-scale", {
        landingPage: "https://example.test/licencas",
        organicScoreThreshold: 60,
      });
      assert.equal(store.config("ws-scale").organicScoreThreshold, 60);
    });
    await t.test(
      "geração registra evidência e diário; repetir não duplica",
      () => {
        service.generate(manager, "ws-scale", "real");
        const count = store.list("recommendations", "ws-scale").length;
        service.generate(manager, "ws-scale", "real");
        assert.equal(store.list("recommendations", "ws-scale").length, count);
        assert.equal(store.list("journal", "ws-scale").length, 1);
        assert.ok(
          store
            .list("audit", "ws-scale")
            .some((a) => a.action === "recommendation_created"),
        );
      },
    );
    await t.test(
      "aprovação persiste usuário métricas e decisão, sem execução",
      () => {
        const r = store.list("recommendations", "ws-scale")[0]!;
        const d = service.decide(manager, "ws-scale", r.id, "approved", "", "");
        assert.equal(d.actorId, managerUser.id);
        assert.deepEqual(d.before, r.before);
        assert.equal(d.outcome.status, "inconclusive");
        assert.throws(() =>
          service.decide(admin, "ws-scale", r.id, "approved", "", ""),
        );
      },
    );
    await t.test("decisão de outro workspace é inacessível", () => {
      const d = store.list("decisions", "ws-scale")[0]!;
      assert.throws(() => service.mark(admin, "ws-dinamix", "task", d.id));
    });
    await t.test("demo isolada não agrega recomendações reais", () => {
      service.generate(manager, "ws-scale", "demo");
      const snap = service.snapshot(manager, "ws-scale", "demo");
      assert.ok(snap.recommendations.every((r) => r.mode === "demo"));
      assert.ok(
        snap.metrics &&
          Object.values(snap.metrics).every((m) => m.source === "demo"),
      );
    });
    await t.test("rejeição armazena motivo e observação", () => {
      const r = store
        .list("recommendations", "ws-scale")
        .find((r) => r.mode === "demo")!;
      const d = service.decide(
        manager,
        "ws-scale",
        r.id,
        "rejected",
        "campanha ainda em teste",
        "Vou observar.",
      );
      assert.equal(d.note, "Vou observar.");
      assert.equal(d.reason, "campanha ainda em teste");
    });
    await t.test("recomendação expirada não pode ser aprovada", () => {
      const r = store
        .list("recommendations", "ws-scale")
        .find((r) => r.status === "pending")!;
      store.save("recommendations", { ...r, expiresAt: clock - 1 });
      assert.throws(() =>
        service.decide(manager, "ws-scale", r.id, "approved", "", ""),
      );
    });
    await t.test("mudança material substitui recomendação pendente", () => {
      const r = store
        .list("recommendations", "ws-scale")
        .find((r) => r.mode === "real")!;
      store.save("recommendations", {
        ...r,
        status: "pending",
        expiresAt: clock + 86400000,
      });
      source.crm.leads = source.crm.leads.slice(0, 2);
      service.generate(manager, "ws-scale", "real");
      assert.equal(
        store.get("recommendations", "ws-scale", r.id)!.status,
        "superseded",
      );
    });
    await t.test("cooldown bloqueia conflito sem mudança material", () => {
      const r = store
        .list("recommendations", "ws-scale")
        .find((r) => r.mode === "real" && r.status === "pending")!;
      store.save("recommendations", { ...r, type: "SCALE", rule: "outro" });
      const count = store.list("recommendations", "ws-scale").length;
      service.generate(manager, "ws-scale", "real");
      assert.equal(store.list("recommendations", "ws-scale").length, count);
    });
    await t.test("novo criativo mantém opcionais nulos e fonte manual", () => {
      const c = service.saveCreative(
        manager,
        "ws-scale",
        {
          title: "Reel real",
          profileId: "perfil-real",
          organic: { views: "" },
        },
        "real",
      );
      assert.equal(c.organic.views, null);
      assert.equal(c.businessScore.value, null);
      assert.equal(c.source, "manual");
      assert.throws(() =>
        service.saveCreative(
          manager,
          "ws-scale",
          { id: c.id, title: "x", profileId: "p" },
          "demo",
        ),
      );
    });
    await t.test("edição por ID de outro workspace é rejeitada", () => {
      const c = store.list("creatives", "ws-scale")[0]!;
      assert.throws(() =>
        service.saveCreative(
          admin,
          "ws-dinamix",
          { id: c.id, title: "x", profileId: "p" },
          "real",
        ),
      );
    });
    await t.test("orgânico inválido e publicação futura são rejeitados", () => {
      assert.throws(() =>
        service.saveCreative(
          manager,
          "ws-scale",
          { title: "x", profileId: "p", organic: { retention: 101 } },
          "real",
        ),
      );
      assert.throws(() =>
        service.saveCreative(
          manager,
          "ws-scale",
          { title: "x", profileId: "p", publishedAt: "2099-01-01" },
          "real",
        ),
      );
    });
    await t.test("exemplos demo idempotentes e perfil próprio", () => {
      service.seedDemo(manager, "ws-scale");
      const count = store.list("creatives", "ws-scale").length;
      service.seedDemo(manager, "ws-scale");
      assert.equal(store.list("creatives", "ws-scale").length, count);
      assert.equal(
        service.snapshot(manager, "ws-scale", "real").creatives.length,
        1,
      );
    });
    let creativeId = "",
      testId = "";
    await t.test(
      "avaliar prolonga observação sem amostra e pontua com histórico",
      () => {
        const real = store
          .list("creatives", "ws-scale")
          .find((c) => c.source === "manual")!;
        assert.equal(
          service.evaluateCreative(manager, "ws-scale", real.id).status,
          "organic_observation",
        );
        const demo = store
          .list("creatives", "ws-scale")
          .find((c) => c.title === "Reel demonstrativo 1")!;
        creativeId = demo.id;
        const scored = service.evaluateCreative(manager, "ws-scale", demo.id);
        assert.ok(
          scored.organicScore.value !== null && scored.organicScore.value >= 60,
        );
        assert.equal(scored.status, "organic_evaluated");
      },
    );
    await t.test("proposta exige elegibilidade e tracking completo", () => {
      const t = service.proposeTest(manager, "ws-scale", creativeId, "GROWTH");
      testId = t.id;
      assert.equal(t.status, "proposed");
      for (const key of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "traffic_workspace_id",
        "traffic_campaign_id",
        "traffic_adset_id",
        "traffic_ad_id",
        "traffic_creative_id",
      ])
        assert.ok(t.tracking[key]);
      assert.equal(t.tracking.traffic_workspace_id, "ws-scale");
      assert.throws(() =>
        service.proposeTest(manager, "ws-scale", creativeId, "GROWTH"),
      );
    });
    await t.test(
      "teto considera soma dos dois testes com decimal exato",
      () => {
        service.configure(admin, "ws-scale", { maxTestBudgetPerReel: "75" });
        assert.throws(() =>
          service.proposeTest(manager, "ws-scale", creativeId, "CONVERSION"),
        );
        service.configure(admin, "ws-scale", { maxTestBudgetPerReel: "100" });
        assert.equal(
          service.proposeTest(manager, "ws-scale", creativeId, "CONVERSION")
            .budget,
          "50",
        );
      },
    );
    await t.test("aprovação de teste fica paid_test_pending", () => {
      const t = service.decideTest(manager, "ws-scale", testId, true, "");
      assert.equal(t.status, "paid_test_pending");
      assert.equal(t.during, null);
      assert.equal(t.result, "inconclusive");
      assert.equal(
        store.get("creatives", "ws-scale", creativeId)!.status,
        "paid_test_pending",
      );
      assert.throws(() =>
        service.decideTest(manager, "ws-scale", testId, true, ""),
      );
    });
    await t.test("rejeição do segundo teste não simula execução", () => {
      const t = store
        .list("tests", "ws-scale")
        .find((t) => t.type === "CONVERSION")!;
      assert.equal(
        service.decideTest(manager, "ws-scale", t.id, false, "Sem prioridade")
          .status,
        "rejected",
      );
    });
    await t.test(
      "notificações lidas por usuário e tarefa local concluída",
      () => {
        const n = store.list("notifications", "ws-scale")[0]!;
        service.mark(manager, "ws-scale", "notification", n.id);
        assert.ok(
          store
            .get("notifications", "ws-scale", n.id)!
            .readBy.includes(managerUser.id),
        );
        const d = store.list("decisions", "ws-scale")[0]!;
        service.mark(manager, "ws-scale", "task", d.id);
        assert.equal(
          store.get("decisions", "ws-scale", d.id)!.taskStatus,
          "done",
        );
      },
    );
    await t.test("outcome permanece inconclusivo sem janela comparável", () => {
      clock += 10 * 86400000;
      source.crm.state.lastSuccessAt = clock;
      service.generate(manager, "ws-scale", "real");
      assert.ok(
        store
          .list("decisions", "ws-scale")
          .some((d) => d.outcome.status === "inconclusive"),
      );
    });
    await t.test("reabrir SQLite preserva decisões e auditoria", () => {
      const reopened = new SqliteIntelligenceRepository(path);
      assert.ok(reopened.list("decisions", "ws-scale").length);
      assert.ok(
        reopened
          .list("audit", "ws-scale")
          .some((a) => a.action === "test_approved"),
      );
      reopened.close();
    });
  } finally {
    store.close();
    wsStore.close();
    aStore.close();
    const full = resolve(dir);
    if (
      dirname(full) === resolve(tmpdir()) &&
      basename(full).startsWith("traffic-intelligence-")
    )
      rmSync(full, { recursive: true, force: true });
  }
});

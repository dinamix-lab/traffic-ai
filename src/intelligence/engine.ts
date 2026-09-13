import type { IntelligenceConfig } from "./config";
import type {
  Action,
  AnalysisInput,
  Bottleneck,
  Evidence,
  Health,
  MetricKey,
  Recommendation,
  Sufficiency,
} from "./types";
import { numeric, relative, compare, trend } from "./math";
export const RULE_VERSION = "deterministic-1.1";
export function sufficiency(
  i: AnalysisInput,
  c: IntelligenceConfig,
): Sufficiency {
  const leads = numeric(i.current.leads) ?? 0,
    clicks = numeric(i.current.clicks) ?? 0;
  if (
    i.period.days < c.minDays ||
    (leads < c.minLeads && clicks < c.minClicks) ||
    ((i.coverage.crm ?? 0) < 50 && (i.coverage.meta ?? 0) < 50)
  )
    return "INSUFFICIENT";
  if (leads < c.minLeads || i.period.days < c.strongDays) return "LOW";
  if (
    leads >= c.strongLeads &&
    i.period.days >= c.strongDays &&
    Math.max(i.coverage.crm ?? 0, i.coverage.meta ?? 0) >= 90
  )
    return "STRONG";
  return "MODERATE";
}
export function confidence(
  i: AnalysisInput,
  c: IntelligenceConfig,
  s: Sufficiency,
  signals: number,
  conflicts: number,
) {
  const volatility = trend(
    i.series.map((p) => numeric(p.metrics.leads)),
  ).volatility;
  let score =
    15 +
    Math.min(25, ((numeric(i.current.leads) ?? 0) / c.strongLeads) * 25) +
    Math.min(15, (i.period.days / c.strongDays) * 15) +
    Math.min(15, signals * 5) +
    ((i.coverage.attribution ?? 0) / 100) * 10 +
    (i.coverage.crm === 100 ? 10 : 0) +
    (volatility !== null && volatility <= c.volatilityLimit ? 10 : 0) -
    conflicts * 12;
  if (i.learning) score -= 15;
  if (i.limitations.some((l) => l.includes("anterior incompleto"))) score -= 15;
  score = Math.round(
    Math.max(
      0,
      Math.min(
        s === "INSUFFICIENT"
          ? 29
          : s === "LOW"
            ? 49
            : s === "MODERATE"
              ? 69
              : 95,
        score,
      ),
    ),
  );
  return {
    score,
    level: (score < 50
      ? "baixa"
      : score < 70
        ? "moderada"
        : score < 85
          ? "alta"
          : "muito alta") as Recommendation["confidenceLevel"],
  };
}
export function guardrails(
  i: AnalysisInput,
  c: IntelligenceConfig,
  action: Action,
  s: Sufficiency,
  score: number,
) {
  const blocked: string[] = [];
  if (
    ["SCALE", "PAUSE", "REDUCE_BUDGET", "REPLACE_CREATIVE"].includes(action)
  ) {
    if (s !== "MODERATE" && s !== "STRONG")
      blocked.push("Amostra insuficiente para alteração de mídia.");
    if (score < c.confidenceMinimum)
      blocked.push("Confiança abaixo do mínimo configurado.");
    if (
      i.current.spend.value === null ||
      compare(i.current.spend.value, c.minSpend) < 0
    )
      blocked.push("Investimento confirmado abaixo do mínimo.");
    if (
      i.coverage.meta !== 100 ||
      i.coverage.crm !== 100 ||
      (i.coverage.attribution ?? 0) < 80
    )
      blocked.push("Cobertura de mídia/comercial/atribuição insuficiente.");
    if ((numeric(i.current.sales) ?? 0) < c.minConversions)
      blocked.push("Conversões abaixo do mínimo.");
    if (
      i.learning ||
      (i.lastChangedAt !== null &&
        i.now - i.lastChangedAt < c.cooldownHours * 3600000)
    )
      blocked.push("Fase de aprendizado ou alteração recente.");
  }
  return blocked;
}
export function analyze(
  i: AnalysisInput,
  c: IntelligenceConfig,
): Recommendation {
  i = structuredClone(i);
  if (i.mode === "real") {
    const hasSimulation = Object.values(i.current).some(
      (m) => m.source === "demo",
    );
    for (const metrics of [i.current, i.previous]) {
      for (const m of Object.values(metrics))
        if (m.source === "demo") {
          m.value = null;
          m.source = "missing";
          m.reason = "Demonstração excluída da análise real.";
        }
      if (hasSimulation)
        for (const key of [
          "cpl",
          "costQualified",
          "costScheduled",
          "costCompleted",
          "costProposal",
          "cac",
          "roas",
          "clickLeadRate",
        ] as const)
          metrics[key] = {
            ...metrics[key],
            value: null,
            source: "missing",
            reason: "Não combinamos mídia simulada e CRM real.",
          };
    }
    if (hasSimulation) {
      i.coverage.meta = null;
      i.limitations.push(
        "Mídia simulada excluída; nenhuma eficiência financeira real foi calculada com ela.",
      );
    }
  }
  const evidence: Evidence[] = [],
    conflicts: string[] = [];
  const n = (k: MetricKey) => numeric(i.current[k]);
  const delta = (k: MetricKey) =>
    relative(i.current[k].value, i.previous[k].value);
  const has = (k: MetricKey) => i.current[k].value !== null;
  const ev = (k: MetricKey) => {
    if (!has(k) || evidence.some((e) => e.metric === k)) return;
    const d = delta(k);
    evidence.push({
      metric: k,
      current: i.current[k].value!,
      previous: i.previous[k].value,
      change: d,
      source: i.current[k].source,
      statement: `${k}: ${i.current[k].value}${i.previous[k].value !== null ? ` vs ${i.previous[k].value}` : "; sem base anterior"}${d !== null ? ` (${d > 0 ? "+" : ""}${d}%)` : ""}.`,
    });
  };
  let type: Action = "WAIT_FOR_DATA",
    diagnosis = "Necessidade de mais dados",
    cause = "Amostra ou cobertura ainda não sustenta uma decisão.",
    rule = "sufficiency",
    bottleneck: Bottleneck | null = "INSUFFICIENT_DATA";
  const s = sufficiency(i, c);
  const set = (
    a: Action,
    d: string,
    ca: string,
    r: string,
    b: Bottleneck | null,
    ks: MetricKey[],
  ) => {
    type = a;
    diagnosis = d;
    cause = ca;
    rule = r;
    bottleneck = b;
    ks.forEach(ev);
  };
  const risingCpl = (delta("cpl") ?? -Infinity) >= c.cplRisePct;
  const qualityBetter =
    (delta("qualificationRate") ?? -Infinity) >= c.qualityChangePct;
  const closerBetter =
    (delta("costCompleted") ?? Infinity) <= -c.qualityChangePct ||
    (delta("roas") ?? -Infinity) >= c.qualityChangePct;
  if (risingCpl && (qualityBetter || closerBetter))
    conflicts.push(
      "CPL piorou, mas qualidade ou eficiência comercial melhorou. Não reduzir pelo CPL isolado.",
    );
  if (s !== "INSUFFICIENT") {
    set(
      "MAINTAIN",
      "Sem deterioração material sustentada",
      "Manter observação; ausência de alerta não comprova desempenho ideal.",
      "stable",
      null,
      ["leads", "qualificationRate", "sales", "revenue"],
    );
    if (
      (n("qualified") ?? 0) >= c.minLeads &&
      (delta("schedulingRate") ?? 0) <= -c.rateDropPct
    )
      set(
        "INVESTIGATE_SALES_PROCESS",
        "Gargalo no agendamento",
        "Possível dificuldade no contato ou agendamento; validar com o comercial.",
        "scheduling",
        "SCHEDULING",
        ["qualified", "schedulingRate"],
      );
    if (
      (n("completed") ?? 0) >= c.minCalls &&
      (n("callProposalRate") ?? 100) < c.callProposalFloor
    )
      set(
        "INVESTIGATE_SALES_PROCESS",
        "Baixa conversão de call em proposta",
        "Investigar adequação da oferta e condução comercial.",
        "call-proposal",
        "SALES",
        ["completed", "callProposalRate", "proposals"],
      );
    if (
      (n("completed") ?? 0) >= c.minCalls &&
      (n("callSaleRate") ?? 100) < c.callSaleFloor
    )
      set(
        "INVESTIGATE_SALES_PROCESS",
        "Baixa conversão de call em venda",
        "Investigar fechamento; este sinal não responsabiliza a mídia.",
        "call-sale",
        "CLOSING",
        ["completed", "callSaleRate", "sales"],
      );
    if (
      (n("leads") ?? 0) >= c.minLeads &&
      ((n("qualificationRate") ?? 100) < c.qualificationFloor ||
        (delta("qualificationRate") ?? 0) <= -c.qualityChangePct)
    )
      set(
        "INVESTIGATE_LEAD_QUALITY",
        "Qualidade dos leads requer atenção",
        "Revisar promessa, público e critérios de qualificação com o CRM.",
        "lead-quality",
        "LEAD_QUALITY",
        ["leads", "qualified", "qualificationRate"],
      );
    if (
      (n("clicks") ?? 0) >= c.minClicks &&
      has("clickLeadRate") &&
      (n("clickLeadRate") ?? 100) < c.clickLeadFloor &&
      (delta("ctr") ?? -100) >= -c.stablePct &&
      (delta("cpc") ?? 100) <= c.stablePct
    )
      set(
        "INVESTIGATE_LANDING_PAGE",
        "Possível gargalo após o clique",
        "Validar carregamento, formulário e tracking; não há prova de falha na landing page.",
        "landing-page",
        "LANDING_PAGE",
        ["clicks", "ctr", "cpc", "clickLeadRate"],
      );
    if ((delta("cpm") ?? 0) >= c.cpmRisePct)
      set(
        "TEST_NEW_CREATIVE",
        "CPM em deterioração",
        "Possível mudança no leilão ou entrega; comparar público e posicionamento.",
        "cpm",
        "MEDIA",
        ["cpm", "ctr", "frequency"],
      );
    if ((delta("ctr") ?? 0) <= -c.ctrDropPct)
      set(
        "TEST_NEW_CREATIVE",
        "CTR em deterioração",
        "Validar mensagem e adequação do criativo antes de alterar orçamento.",
        "ctr",
        "CREATIVE",
        ["ctr", "cpm"],
      );
    if ((n("frequency") ?? 0) > c.frequencyLimit)
      set(
        "TEST_NEW_CREATIVE",
        "Frequência elevada",
        "Exposição repetida é um sinal; não prova fadiga isoladamente.",
        "frequency",
        "CREATIVE",
        ["frequency", "ctr"],
      );
    if (
      (delta("ctr") ?? 0) <= -c.ctrDropPct &&
      Math.abs(delta("cpm") ?? Infinity) <= c.stablePct &&
      (delta("frequency") ?? 0) > 0 &&
      (n("frequency") ?? 0) > c.frequencyLimit
    )
      set(
        "TEST_NEW_CREATIVE",
        "Provável fadiga criativa",
        "CTR caiu, CPM ficou estável e frequência cresceu; testar variações é mais prudente que pausar pelo CPL.",
        "creative-fatigue",
        "CREATIVE",
        ["ctr", "cpm", "frequency", "qualificationRate"],
      );
    if (risingCpl && qualityBetter)
      set(
        "MAINTAIN",
        "Qualidade melhor apesar de CPL maior",
        "O avanço comercial conflita com o custo do lead. Manter orçamento e avaliar novos criativos.",
        "cpl-quality",
        null,
        ["cpl", "qualificationRate", "costCompleted", "roas"],
      );
    else if (risingCpl && !closerBetter && rule === "stable")
      set(
        "INVESTIGATE_LEAD_QUALITY",
        "CPL em deterioração",
        "Investigar funil antes de sugerir redução de orçamento.",
        "cpl",
        "LEAD_QUALITY",
        ["cpl", "qualificationRate", "costCompleted"],
      );
    if (
      (n("completed") ?? 0) + (n("noShows") ?? 0) >= c.minCalls &&
      ((n("showRate") ?? 100) < c.showRateFloor ||
        (delta("showRate") ?? 0) <= -c.rateDropPct)
    )
      set(
        "INVESTIGATE_SALES_PROCESS",
        "Gargalo no show rate",
        "O sinal principal está no comparecimento. Conferir confirmação, agenda e prazo; não há evidência suficiente para atribuir a causa à mídia.",
        "show-rate",
        "SHOW_RATE",
        ["scheduled", "completed", "noShows", "showRate", "qualificationRate"],
      );
    if (
      c.cacTarget &&
      has("cac") &&
      compare(i.current.cac.value!, c.cacTarget) > 0 &&
      !conflicts.length &&
      rule === "stable"
    )
      set(
        "REDUCE_BUDGET",
        "CAC acima do alvo configurado",
        "Possível ineficiência; revisar uma redução dentro dos guardrails, sem execução automática.",
        "cac",
        "MEDIA",
        ["cac", "sales", "spend"],
      );
    if (
      c.roasTarget &&
      has("roas") &&
      compare(i.current.roas.value!, c.roasTarget) >= 0 &&
      (numeric(i.current.sales) ?? 0) >= c.minConversions &&
      (delta("roas") ?? -1) >= 0 &&
      (!c.cacTarget ||
        (has("cac") && compare(i.current.cac.value!, c.cacTarget) <= 0)) &&
      rule === "stable"
    )
      set(
        "SCALE",
        i.entityType === "creative"
          ? "Criativo candidato a vencedor"
          : "Oportunidade de escala",
        "Resultado comercial atribuído acima do alvo e sem deterioração conhecida. Validar capacidade e aprendizado antes de agir.",
        "scale",
        null,
        ["sales", "revenue", "roas", "cac"],
      );
  }
  if (!evidence.length)
    ["leads", "spend", "completed"].forEach((k) => ev(k as MetricKey));
  const conf = confidence(
    i,
    c,
    s,
    evidence.filter((e) => e.previous !== null && e.change !== null).length,
    conflicts.length,
  );
  const blockedBy = guardrails(i, c, type, s, conf.score);
  if (blockedBy.length) {
    type = "WAIT_FOR_DATA";
    diagnosis += " · ação retida pelos guardrails";
  }
  const downstream = ["SHOW_RATE", "SALES", "CLOSING"].includes(
    bottleneck || "",
  );
  const priority =
    s === "INSUFFICIENT" || conf.score < 50
      ? "LOW"
      : conf.score >= 70 && (downstream || (type as Action) === "SCALE")
        ? "HIGH"
        : "MEDIUM";
  const suggestedAction =
    type === "WAIT_FOR_DATA"
      ? "AGUARDAR MAIS DADOS. Reavaliar após ampliar amostra/cobertura."
      : type === "SCALE"
        ? `Revisar aumento de até ${c.maxIncreasePct}% com o gestor; nenhuma alteração será executada.`
        : type === "REDUCE_BUDGET"
          ? `Revisar redução de até ${c.maxReductionPct}% com o gestor; nenhuma alteração será executada.`
          : type === "TEST_NEW_CREATIVE"
            ? "Testar novos criativos, preservando a comparação comercial e o orçamento até decisão humana."
            : type === "MAINTAIN"
              ? "Manter a estratégia sob observação e acompanhar o resultado comercial."
              : "Investigar o gargalo indicado com os responsáveis e registrar a decisão.";
  return {
    id: "",
    workspaceId: i.workspaceId,
    entityType: i.entityType,
    entityId: i.entityId,
    entityName: i.name,
    type,
    title: diagnosis,
    summary: `${cause} ${suggestedAction}`,
    evidence,
    diagnosis,
    probableCause: cause,
    businessImpact: downstream
      ? "Uma perda nesta etapa pode limitar oportunidades comerciais; impacto financeiro ainda não estimado."
      : "Preservar eficiência de aquisição e resultado comercial; sem projeção garantida.",
    suggestedAction,
    confidenceScore: conf.score,
    confidenceLevel: conf.level,
    dataSufficiency: s,
    priority,
    createdAt: i.now,
    expiresAt: i.now + c.recommendationHours * 3600000,
    status: "pending",
    mode: i.mode,
    rule,
    ruleVersion: RULE_VERSION,
    period: i.period,
    before: i.current,
    previous: i.previous,
    coverage: i.coverage,
    limitations: i.limitations,
    conflicts,
    bottleneck,
    estimatedImpact: {
      value: null,
      impactType: "not_estimated",
      calculationMethod: "Sem modelo de projeção validado",
      confidence: 0,
    },
    blockedBy,
  };
}
export function trafficHealth(i: AnalysisInput): Health {
  const components = [
    { name: "Mídia · cobertura", score: i.coverage.meta },
    { name: "Criativos · cobertura", score: i.coverage.creative },
    { name: "Qualificação", score: numeric(i.current.qualificationRate) },
    { name: "Funil · show rate", score: numeric(i.current.showRate) },
    { name: "Vendas · fechamento", score: numeric(i.current.closeRate) },
    { name: "Atribuição", score: i.coverage.attribution },
    { name: "Qualidade dos dados CRM", score: i.coverage.crm },
  ];
  const present = components.filter((x) => x.score !== null);
  return {
    score:
      present.length < 3
        ? null
        : Math.round(
            present.reduce((s, x) => s + Math.min(100, x.score!), 0) /
              present.length,
          ),
    components,
    note: "Índice heurístico parcial de saúde e cobertura (pesos iguais). Não é ROAS, probabilidade ou benchmark universal; componentes ausentes ficam fora.",
  };
}

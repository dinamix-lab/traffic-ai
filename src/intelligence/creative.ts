import { AuthError } from "../auth/errors";
import type {
  Creative,
  Metrics,
  OrganicMetrics,
  Pattern,
  ReelState,
  ScoreResult,
} from "./types";
import { organicKeys } from "./types";
import type { IntelligenceConfig } from "./config";
import { median, numeric, relative } from "./math";
import { compare } from "./math";
import { add, divide } from "../crm/decimal";
export const taxonomy = {
  hook: [
    "curiosidade",
    "dinheiro",
    "oportunidade",
    "problema",
    "erro",
    "comparação",
    "bastidores",
    "provocação",
    "prova",
    "pergunta",
    "outro",
  ],
  angle: [
    "oportunidade de negócio",
    "renda",
    "economia",
    "inovação",
    "empreendedorismo",
    "produto",
    "prova social",
    "bastidores",
    "educação",
    "outro",
  ],
  format: [
    "talking head",
    "POV",
    "demonstração",
    "entrevista",
    "storytelling",
    "lista",
    "reação",
    "bastidores",
    "outro",
  ],
  cta: [
    "seguir",
    "comentar",
    "compartilhar",
    "visitar perfil",
    "acessar landing page",
    "falar no WhatsApp",
    "outro",
  ],
};
export const blankScore = (
  explanation = "Dados insuficientes para calcular.",
): ScoreResult => ({
  value: null,
  sufficiency: "INSUFFICIENT",
  components: [],
  explanation,
  version: "score-1.0",
});
export const emptyOrganic = (): OrganicMetrics =>
  Object.fromEntries(organicKeys.map((k) => [k, null])) as OrganicMetrics;
export function validateOrganic(raw: Record<string, unknown>): OrganicMetrics {
  const out = emptyOrganic();
  for (const key of organicKeys) {
    const v = raw[key];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (
      !Number.isFinite(n) ||
      n < 0 ||
      n > 1e12 ||
      (key === "retention" && n > 100)
    )
      throw new AuthError(
        "Métrica orgânica inválida. Ausência deve ficar em branco.",
      );
    out[key] = n;
  }
  return out;
}
export function organicScore(
  reel: Creative,
  all: Creative[],
  c: IntelligenceConfig,
  now: number,
): ScoreResult {
  if (
    !reel.publishedAt ||
    !reel.organicAsOf ||
    Date.parse(reel.organicAsOf) > now ||
    Date.parse(reel.organicAsOf) - Date.parse(reel.publishedAt) <
      c.organicObservationHours * 3600000 ||
    (reel.organic.views ?? 0) < c.minOrganicViews
  )
    return blankScore(
      "AGUARDAR MAIS DADOS: janela observada ou visualizações abaixo do mínimo.",
    );
  const age = Date.parse(reel.organicAsOf) - Date.parse(reel.publishedAt);
  const history = all.filter(
    (x) =>
      x.id !== reel.id &&
      x.workspaceId === reel.workspaceId &&
      x.profileId === reel.profileId &&
      x.source === reel.source &&
      x.publishedAt &&
      x.organicAsOf &&
      Date.parse(x.publishedAt) < Date.parse(reel.publishedAt!) &&
      (x.organic.views ?? 0) >= c.minOrganicViews &&
      Math.abs(Date.parse(x.organicAsOf) - Date.parse(x.publishedAt) - age) <=
        c.organicObservationHours * 3600000,
  );
  if (history.length < c.organicHistorySize)
    return blankScore(
      `Histórico comparável insuficiente do próprio perfil: ${history.length}/${c.organicHistorySize} criativos.`,
    );
  const components: ScoreResult["components"] = [];
  for (const [key, weight] of [
    ["retention", c.organicRetentionWeight],
    ["shares", c.organicSharesWeight],
    ["saves", c.organicSavesWeight],
    ["profileVisits", c.organicProfileWeight],
    ["followers", c.organicFollowersWeight],
  ] as const) {
    const value = reel.organic[key];
    if (value === null) continue;
    const normalized =
      key === "retention" ? value : value / reel.organic.views!;
    const values = history
      .filter((x) => x.organic[key] !== null)
      .map((x) =>
        key === "retention"
          ? x.organic[key]!
          : x.organic[key]! / x.organic.views!,
      );
    if (values.length < c.organicHistorySize) continue;
    const baseline = median(values);
    if (baseline === null || baseline === 0) continue;
    components.push({
      name: key,
      value: Math.max(0, Math.min(100, (normalized / baseline) * 50)),
      weight,
      baseline,
    });
  }
  if (components.length < 2)
    return blankScore(
      "Menos de dois componentes orgânicos com mediana comparável não nula.",
    );
  return {
    value: Math.round(
      components.reduce((s, x) => s + x.value * x.weight, 0) /
        components.reduce((s, x) => s + x.weight, 0),
    ),
    sufficiency: "MODERATE",
    components,
    explanation: `Comparação com ${history.length} criativos do mesmo perfil e janelas próximas. Mediana = 50; dobro = 100. Não mede capacidade comercial.`,
    version: "organic-1.0",
  };
}
export function businessScore(
  metrics: Metrics | null,
  all: Metrics[],
  c: IntelligenceConfig,
): ScoreResult {
  if (!metrics || (numeric(metrics.leads) ?? 0) < c.minLeads)
    return blankScore(
      "Amostra comercial insuficiente; não há score comercial substituído por score orgânico.",
    );
  const history = all.filter(
    (m) =>
      (numeric(m.leads) ?? 0) >= c.minLeads &&
      m.leads.source === metrics.leads.source,
  );
  if (history.length < c.patternMinCreatives)
    return blankScore(
      "Poucos criativos comerciais comparáveis neste workspace.",
    );
  const components: ScoreResult["components"] = [];
  for (const [key, weight] of [
    ["qualificationRate", c.businessQualityWeight],
    ["completed", c.businessCallsWeight],
    ["proposals", c.businessProposalsWeight],
    ["sales", c.businessSalesWeight],
    ["roas", c.businessEfficiencyWeight],
  ] as const) {
    const raw = numeric(metrics[key]);
    if (raw === null) continue;
    const normalized = ["completed", "proposals", "sales"].includes(key)
      ? raw / (numeric(metrics.leads) ?? 1)
      : raw;
    const values = history
      .filter((m) => numeric(m[key]) !== null)
      .map((m) =>
        ["completed", "proposals", "sales"].includes(key)
          ? numeric(m[key])! / (numeric(m.leads) ?? 1)
          : numeric(m[key])!,
      );
    const baseline =
      values.length >= c.patternMinCreatives ? median(values) : null;
    if (!baseline) continue;
    components.push({
      name: key,
      value: Math.max(0, Math.min(100, (normalized / baseline) * 50)),
      weight,
      baseline,
    });
  }
  for (const key of ["revenue", "cac"] as const) {
    const normalize = (m: Metrics) =>
      m[key].value === null
        ? null
        : key === "revenue"
          ? divide(m[key].value!, m.leads.value!, 18)
          : m[key].value;
    const current = normalize(metrics);
    const values = history
      .map(normalize)
      .filter((v): v is string => v !== null)
      .sort(compare);
    if (current === null || values.length < c.patternMinCreatives) continue;
    const middle = Math.floor(values.length / 2);
    const baseline =
      values.length % 2
        ? values[middle]!
        : divide(add(values[middle - 1]!, values[middle]!), "2", 18)!;
    const ratio =
      key === "cac"
        ? divide(baseline, current, 6)
        : divide(current, baseline, 6);
    if (ratio === null || compare(baseline, "0") === 0) continue;
    components.push({
      name: key === "revenue" ? "revenue_per_lead" : "cac_inverse",
      value: Math.max(0, Math.min(100, Number(ratio) * 50)),
      weight:
        key === "revenue" ? c.businessSalesWeight : c.businessEfficiencyWeight,
      baseline,
    });
  }
  if (components.length < 2)
    return blankScore("Componentes comerciais comparáveis insuficientes.");
  return {
    value: Math.round(
      components.reduce((s, x) => s + x.value * x.weight, 0) /
        components.reduce((s, x) => s + x.weight, 0),
    ),
    sufficiency: "MODERATE",
    components,
    explanation:
      "Score relativo dentro do workspace, por lead e eficiência atribuída disponível. Mediana = 50. Não é lucro nem garantia de escala.",
    version: "business-1.0",
  };
}
const transitions: Record<ReelState, ReelState[]> = {
  published: ["organic_observation"],
  organic_observation: ["organic_evaluated"],
  organic_evaluated: ["test_proposed", "organic_observation"],
  test_proposed: ["test_approved", "organic_evaluated"],
  test_approved: ["paid_test_pending"],
  paid_test_pending: ["paid_testing"],
  paid_testing: [
    "scale_candidate",
    "maintain_candidate",
    "pause_candidate",
    "completed",
  ],
  scale_candidate: ["completed"],
  maintain_candidate: ["completed"],
  pause_candidate: ["completed"],
  completed: [],
};
export function transition(
  reel: Creative,
  next: ReelState,
  actorId: string,
  now: number,
  text: string,
) {
  if (!transitions[reel.status].includes(next))
    throw new AuthError("Transição de Reel não permitida.", 409);
  if (
    [
      "paid_testing",
      "scale_candidate",
      "maintain_candidate",
      "pause_candidate",
      "completed",
    ].includes(next)
  )
    throw new AuthError(
      "Execução e monitoramento pago dependem da integração Meta futura; teste permanece pendente.",
      409,
    );
  reel.status = next;
  reel.timeline.push({ at: now, state: next, text, actorId });
}
export function patterns(
  creatives: Creative[],
  c: IntelligenceConfig,
): Pattern[] {
  const eligible = creatives.filter(
    (x) =>
      x.business && x.source !== "demo" && (numeric(x.business.leads) ?? 0) > 0,
  );
  const output: Pattern[] = [];
  for (const field of ["hook", "angle", "format", "cta"] as const) {
    for (const value of new Set(
      eligible.map((x) => x[field]).filter(Boolean),
    )) {
      const group = eligible.filter((x) => x[field] === value),
        other = eligible.filter((x) => x[field] !== value);
      const leads = group.reduce(
          (s, x) => s + (numeric(x.business!.leads) ?? 0),
          0,
        ),
        qualified = group.reduce(
          (s, x) => s + (numeric(x.business!.qualified) ?? 0),
          0,
        );
      const otherLeads = other.reduce(
        (s, x) => s + (numeric(x.business!.leads) ?? 0),
        0,
      );
      if (!leads || !otherLeads) continue;
      const rate = (qualified / leads) * 100,
        base =
          (other.reduce(
            (s, x) => s + (numeric(x.business!.qualified) ?? 0),
            0,
          ) /
            otherLeads) *
          100;
      const sufficient =
        group.length >= c.patternMinCreatives &&
        other.length >= c.patternMinCreatives &&
        leads >= c.patternMinLeads &&
        otherLeads >= c.patternMinLeads;
      const strong =
        sufficient &&
        group.length >= c.patternMinCreatives * 2 &&
        other.length >= c.patternMinCreatives * 2 &&
        leads >= c.patternMinLeads * 2 &&
        otherLeads >= c.patternMinLeads * 2;
      output.push({
        id: `${field}:${value}`,
        feature: `${field}: ${value}`,
        status: strong ? "validated" : sufficient ? "emerging" : "hypothesis",
        creatives: group.length,
        leads,
        qualificationRate: rate,
        baselineRate: base,
        change: relative(String(rate), String(base)),
        confidence: strong ? 80 : sufficient ? 60 : 25,
        note: "Associação descritiva vs demais criativos do workspace. validated significa suficiência operacional, não validação causal ou estatística.",
      });
    }
  }
  return output;
}

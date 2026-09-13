import { AuthError } from "../auth/errors";
import { decimal } from "../crm/decimal";
export const defaults = {
  minLeads: 20,
  strongLeads: 100,
  minCalls: 10,
  minConversions: 5,
  minClicks: 100,
  minDays: 3,
  strongDays: 7,
  confidenceMinimum: 65,
  cooldownHours: 72,
  recommendationHours: 48,
  materialChangePct: 25,
  ctrDropPct: 20,
  cpmRisePct: 20,
  cplRisePct: 20,
  qualityChangePct: 15,
  rateDropPct: 15,
  stablePct: 10,
  frequencyLimit: 3.5,
  qualificationFloor: 20,
  showRateFloor: 60,
  callProposalFloor: 30,
  callSaleFloor: 15,
  clickLeadFloor: 2,
  volatilityLimit: 0.6,
  maxIncreasePct: 20,
  maxReductionPct: 20,
  outcomeDays: 7,
  organicObservationHours: 48,
  paidTestDays: 7,
  organicScoreThreshold: 70,
  businessScoreThreshold: 70,
  minOrganicViews: 300,
  organicHistorySize: 5,
  patternMinCreatives: 5,
  patternMinLeads: 100,
  organicRetentionWeight: 2,
  organicSharesWeight: 2,
  organicSavesWeight: 1,
  organicProfileWeight: 1,
  organicFollowersWeight: 2,
  businessQualityWeight: 1,
  businessCallsWeight: 2,
  businessProposalsWeight: 2,
  businessSalesWeight: 3,
  businessEfficiencyWeight: 3,
  minSpend: "100",
  cplTarget: "",
  cacTarget: "",
  roasTarget: "",
  costQualifiedTarget: "",
  costCallTarget: "",
  testBudgetGrowth: "50",
  testBudgetConversion: "50",
  maxTestBudgetPerReel: "100",
  landingPage: "",
};
export type IntelligenceConfig = typeof defaults;
export const configLabels: Record<keyof IntelligenceConfig, string> = {
  minLeads: "Leads mínimos",
  strongLeads: "Leads para amostra forte",
  minCalls: "Calls mínimas",
  minConversions: "Vendas mínimas",
  minClicks: "Cliques mínimos",
  minDays: "Dias mínimos",
  strongDays: "Dias para amostra forte",
  confidenceMinimum: "Confiança mínima para ação (%)",
  cooldownHours: "Intervalo entre decisões (horas)",
  recommendationHours: "Validade da recomendação (horas)",
  materialChangePct: "Mudança material (%)",
  ctrDropPct: "Queda de CTR (%)",
  cpmRisePct: "Aumento de CPM (%)",
  cplRisePct: "Aumento de CPL (%)",
  qualityChangePct: "Mudança de qualidade (%)",
  rateDropPct: "Queda relevante de taxa (%)",
  stablePct: "Margem de estabilidade (%)",
  frequencyLimit: "Frequência de atenção",
  qualificationFloor: "Qualificação mínima (%)",
  showRateFloor: "Show rate mínimo (%)",
  callProposalFloor: "Conversão call → proposta mínima (%)",
  callSaleFloor: "Conversão call → venda mínima (%)",
  clickLeadFloor: "Conversão clique → lead mínima (%)",
  volatilityLimit: "Volatilidade máxima (coeficiente)",
  maxIncreasePct: "Aumento futuro máximo (%)",
  maxReductionPct: "Redução futura máxima (%)",
  outcomeDays: "Dias para avaliar decisão",
  organicObservationHours: "Observação orgânica (horas)",
  paidTestDays: "Duração do teste pago (dias)",
  organicScoreThreshold: "Organic Score mínimo",
  businessScoreThreshold: "Business Score mínimo",
  minOrganicViews: "Visualizações mínimas",
  organicHistorySize: "Histórico mínimo do perfil",
  patternMinCreatives: "Criativos mínimos por padrão",
  patternMinLeads: "Leads mínimos por padrão",
  organicRetentionWeight: "Peso orgânico: retenção",
  organicSharesWeight: "Peso orgânico: compartilhamentos",
  organicSavesWeight: "Peso orgânico: salvamentos",
  organicProfileWeight: "Peso orgânico: visitas ao perfil",
  organicFollowersWeight: "Peso orgânico: seguidores",
  businessQualityWeight: "Peso comercial: qualificação",
  businessCallsWeight: "Peso comercial: calls",
  businessProposalsWeight: "Peso comercial: propostas",
  businessSalesWeight: "Peso comercial: vendas",
  businessEfficiencyWeight: "Peso comercial: eficiência",
  minSpend: "Investimento mínimo para avaliar",
  cplTarget: "CPL alvo (opcional)",
  cacTarget: "CAC alvo (opcional)",
  roasTarget: "ROAS alvo (opcional)",
  costQualifiedTarget: "Custo por qualificado alvo (opcional)",
  costCallTarget: "Custo por call alvo (opcional)",
  testBudgetGrowth: "Orçamento total: teste crescimento",
  testBudgetConversion: "Orçamento total: teste conversão",
  maxTestBudgetPerReel: "Teto total de testes por Reel",
  landingPage: "Landing page para tracking (https)",
};
export function validateConfig(
  input: Record<string, unknown>,
  current: IntelligenceConfig,
): IntelligenceConfig {
  const out = { ...current };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(defaults, key))
      throw new AuthError("Configuração desconhecida.");
    const k = key as keyof IntelligenceConfig;
    if (typeof defaults[k] === "number") {
      const n = Number(value);
      if (
        value === "" ||
        value === null ||
        !Number.isFinite(n) ||
        n <= 0 ||
        n > 100000
      )
        throw new AuthError(`Valor inválido: ${configLabels[k]}.`);
      if (
        (/Pct$|Floor$|Weight$|Threshold$/.test(k) ||
          k === "confidenceMinimum") &&
        n > 100
      )
        throw new AuthError(
          "Percentuais, pesos e scores devem estar entre 0 e 100.",
        );
      if (
        /Days$|Leads$|Calls$|Clicks$|Conversions$|Views$|Size$|Creatives$/.test(
          k,
        ) &&
        !Number.isInteger(n)
      )
        throw new AuthError("Amostras e dias devem ser inteiros.");
      Object.assign(out, { [k]: n });
    } else if (k === "landingPage") {
      const text = String(value || "");
      if (
        text &&
        (!URL.canParse(text) ||
          new URL(text).protocol !== "https:" ||
          new URL(text).username ||
          new URL(text).password)
      )
        throw new AuthError("Use uma landing page HTTPS sem credenciais.");
      out.landingPage = text;
    } else {
      try {
        Object.assign(out, {
          [k]: value === "" && k.endsWith("Target") ? "" : decimal(value),
        });
      } catch {
        throw new AuthError(`Valor monetário inválido: ${configLabels[k]}.`);
      }
    }
  }
  if (
    out.strongLeads < out.minLeads ||
    out.strongDays < out.minDays ||
    out.minDays > 30 ||
    out.strongDays > 30
  )
    throw new AuthError(
      "Amostra forte deve ser maior que a mínima e as janelas não podem exceder 30 dias.",
    );
  return out;
}

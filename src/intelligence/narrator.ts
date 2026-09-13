import type { Recommendation } from "./types";
export interface IntelligenceNarrator {
  summarize(input: {
    workspace: string;
    recommendations: Recommendation[];
  }): string;
}
export class LocalNarrator implements IntelligenceNarrator {
  summarize({
    workspace,
    recommendations: r,
  }: {
    workspace: string;
    recommendations: Recommendation[];
  }) {
    const campaigns = new Set(
      r.filter((x) => x.entityType === "campaign").map((x) => x.entityId),
    ).size;
    const waiting = r.filter((x) => x.type === "WAIT_FOR_DATA").length,
      opportunities = r.filter((x) => x.type === "SCALE").length;
    return `${workspace}: ${campaigns} campanhas com evidência disponível, ${opportunities} oportunidades de escala e ${waiting} análises aguardando dados. ${r.find((x) => x.entityType === "workspace")?.summary || "Gere a análise para construir o briefing."} Modo semiautomático: aprovação registra decisão humana.`;
  }
}

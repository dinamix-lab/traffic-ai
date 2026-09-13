import type { AnalysisInput, MetricKey } from "./types";
import { emptyMetrics, metric, periods, shift } from "./math";
export function demoInputs(
  w: string,
  now: number,
  timezone: string,
): AnalysisInput[] {
  const p = periods("7", now, timezone),
    base = {
      spend: "1000",
      impressions: "100000",
      clicks: "2000",
      ctr: "2",
      cpm: "10",
      cpc: "0.5",
      frequency: "2",
      reach: "50000",
      leads: "100",
      qualified: "50",
      qualificationRate: "50",
      scheduled: "30",
      completed: "20",
      noShows: "5",
      showRate: "80",
      proposals: "15",
      sales: "10",
      closeRate: "10",
      revenue: "5000",
      averageTicket: "500",
      cpl: "10",
      costQualified: "20",
      costScheduled: "33.33",
      costCompleted: "50",
      costProposal: "66.67",
      cac: "100",
      roas: "5",
      clickLeadRate: "5",
      schedulingRate: "30",
      callProposalRate: "75",
      callSaleRate: "50",
    };
  return [
    {
      name: "Demonstração · Fadiga criativa",
      changes: { ctr: "1.2", frequency: "4", cpl: "14" },
    },
    {
      name: "Demonstração · Gargalo comercial",
      changes: { showRate: "35", completed: "10", noShows: "19" },
    },
    {
      name: "Demonstração · Qualidade acima do CPL",
      changes: { cpl: "14", qualificationRate: "75", costCompleted: "35" },
    },
  ].map((d, index) => {
    const current = emptyMetrics(),
      previous = emptyMetrics();
    for (const k of Object.keys(base) as MetricKey[]) {
      current[k] = metric(
        k,
        ({ ...base, ...d.changes } as Record<string, string>)[k]!,
        "demo",
      );
      previous[k] = metric(k, base[k], "demo");
    }
    return {
      workspaceId: w,
      entityType: index === 0 ? "workspace" : "campaign",
      entityId: `demo-${index}`,
      name: d.name,
      mode: "demo",
      current,
      previous,
      period: p.current,
      previousPeriod: p.previous,
      coverage: { meta: 100, crm: 100, attribution: 100, creative: 100 },
      limitations: [
        "DEMONSTRAÇÃO: todas as métricas desta análise são simuladas. Nenhum dado real do CRM foi combinado.",
      ],
      series: Array.from({ length: 7 }, (_, i) => ({
        day: shift(p.current.from, i),
        metrics: { ...current, leads: metric("leads", "15", "demo") },
      })),
      lastChangedAt: null,
      learning: false,
      now,
    };
  });
}

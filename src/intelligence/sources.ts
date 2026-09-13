import type { CrmSnapshot } from "../crm/types";
import type { MetaSnapshot } from "../meta/types";
import { businessMetrics } from "../crm/metrics";
import { attribution, dimension } from "../crm/attribution";
import { add, divide, percent } from "../crm/decimal";
import { emptyMetrics, metric, dateAt, periods, shift } from "./math";
import type { AnalysisInput, MetricKey, Period, WindowKey } from "./types";
export interface DataSources {
  crm: CrmSnapshot;
  meta: MetaSnapshot | null;
  timezone: string;
  name: string;
  initialSince: string;
}
export function sourceMetrics(
  s: DataSources,
  period: Period,
  entityType: AnalysisInput["entityType"],
  entityId: string,
) {
  const result = emptyMetrics();
  const filter = {
    from: period.from,
    to: period.to,
    timezone: period.timezone,
    ...(entityType === "campaign"
      ? { campaign: entityId }
      : entityType === "creative"
        ? { creative: entityId }
        : {}),
  };
  const hasCrm =
    s.crm.state.lastSuccessAt !== null &&
    s.crm.state.lastSyncStatus === "success";
  const commercial = businessMetrics(s.crm, s.meta, filter);
  if (hasCrm) {
    for (const k of [
      "leads",
      "qualified",
      "qualificationRate",
      "scheduled",
      "completed",
      "noShows",
      "showRate",
      "proposals",
      "sales",
      "closeRate",
      "revenue",
      "averageTicket",
      "costQualified",
      "costScheduled",
      "costCompleted",
      "costProposal",
      "cac",
      "roas",
      "cpl",
    ] as const)
      result[k] = metric(k, commercial[k]);
    // Stage rates use unique leads observed in the denominator's cohort, not unrelated period totals.
    const leads = commercial.leadRows;
    const atEnd = (d: string) =>
      dateAt(Date.parse(d), period.timezone) <= period.to;
    const callLeads = new Set(
      s.crm.calls
        .filter(
          (c) =>
            c.leadId &&
            c.fields.call_status === "completed" &&
            c.fields.completed_at &&
            dateAt(Date.parse(c.fields.completed_at), period.timezone) >=
              period.from &&
            atEnd(c.fields.completed_at),
        )
        .map((c) => c.leadId!),
    );
    const matchingIds = new Set(
      s.crm.leads
        .filter(
          (l) =>
            entityType === "workspace" || dimension(l, entityType) == entityId,
        )
        .map((l) => l.id),
    );
    const cohort = [...callLeads].filter((id) => matchingIds.has(id));
    result.schedulingRate = metric(
      "schedulingRate",
      percent(
        leads.filter((l) =>
          s.crm.calls.some(
            (c) =>
              c.leadId === l.id &&
              c.fields.first_scheduled_at &&
              atEnd(c.fields.first_scheduled_at),
          ),
        ).length,
        leads.length,
      ),
    );
    result.callProposalRate = metric(
      "callProposalRate",
      percent(
        cohort.filter((id) =>
          s.crm.proposals.some((p) => p.leadId === id && atEnd(p.originAt)),
        ).length,
        cohort.length,
      ),
    );
    result.callSaleRate = metric(
      "callSaleRate",
      percent(
        cohort.filter((id) =>
          s.crm.sales.some((p) => p.leadId === id && atEnd(p.originAt)),
        ).length,
        cohort.length,
      ),
    );
  }
  const meta = s.meta;
  const compatible =
    !!meta?.connection?.connected &&
    meta.accounts.some((a) => a.selected) &&
    meta.accounts
      .filter((a) => a.selected)
      .every(
        (a) => a.currency === s.crm.currency && a.timezone === period.timezone,
      );
  const entityRaw = entityId.replace(/^(meta|traffic):/, "");
  const ads = new Set(
    meta?.resources
      .filter(
        (r) =>
          r.kind === "ads" &&
          (r.payload.creative as { id?: string } | undefined)?.id === entityRaw,
      )
      .map((r) => r.id),
  );
  const selected = new Set(
    meta?.accounts.filter((a) => a.selected).map((a) => a.id),
  );
  const rows = compatible
    ? meta!.resources.filter(
        (r) =>
          r.kind === "insights" &&
          selected.has(r.accountId) &&
          r.date >= period.from &&
          r.date <= period.to &&
          (entityType === "workspace" ||
            ((entityId.startsWith("meta:") ||
              entityId.startsWith("traffic:")) &&
              (entityType === "campaign"
                ? r.payload.campaign_id === entityRaw
                : ads.has(r.id)))),
      )
    : [];
  for (const [k, field] of [
    ["spend", "spend"],
    ["impressions", "impressions"],
    ["clicks", "clicks"],
  ] as const) {
    if (
      rows.length &&
      rows.every(
        (r) =>
          typeof r.payload[field] === "string" &&
          /^\d+(\.\d+)?$/.test(String(r.payload[field])),
      )
    )
      result[k] = metric(
        k,
        rows.reduce((a, r) => add(a, String(r.payload[field])), "0"),
      );
  }
  // Reach/frequency are not additive across days or ads. Use only a single imported aggregate row.
  if (rows.length === 1)
    for (const k of ["reach", "frequency"] as const)
      if (rows[0]!.payload[k] != null)
        result[k] = metric(k, String(rows[0]!.payload[k]));
  const ratio = (k: MetricKey, a: MetricKey, b: MetricKey, multiplier = 1) => {
    const av = result[a].value,
      bv = result[b].value;
    if (av !== null && bv !== null) {
      const value = divide(av, bv, 6);
      result[k] = metric(
        k,
        value === null
          ? null
          : multiplier === 1
            ? value
            : String(Number(value) * multiplier),
      );
    }
  };
  ratio("ctr", "clicks", "impressions", 100);
  ratio("cpc", "spend", "clicks");
  // CPM multiplier is applied as exact decimal addition, not binary money arithmetic.
  if (result.spend.value !== null && result.impressions.value !== null) {
    const perThousand = divide(result.impressions.value, "1000", 18);
    result.cpm = metric(
      "cpm",
      perThousand === null ? null : divide(result.spend.value, perThousand, 4),
    );
  }
  if (
    hasCrm &&
    commercial.cpl !== null &&
    commercial.leads > 0 &&
    result.clicks.value !== null
  )
    ratio("clickLeadRate", "leads", "clicks", 100);
  const coverageMeta = compatible
    ? Math.round((new Set(rows.map((r) => r.date)).size / period.days) * 100)
    : null;
  const relevantSales = s.crm.sales.filter(
    (sale) =>
      dateAt(Date.parse(sale.originAt), period.timezone) >= period.from &&
      dateAt(Date.parse(sale.originAt), period.timezone) <= period.to,
  );
  const relevantLeads = s.crm.leads.filter(
    (l) => entityType === "workspace" || dimension(l, entityType) === entityId,
  );
  const leadIds = new Set(relevantLeads.map((l) => l.id));
  const sales = relevantSales.filter(
    (sale) =>
      entityType === "workspace" || (!!sale.leadId && leadIds.has(sale.leadId)),
  );
  const assigned = new Set(
    relevantLeads
      .filter((l) => ["exact", "strong"].includes(attribution(l).status))
      .map((l) => l.id),
  );
  const attributionCoverage = sales.length
    ? (100 *
        sales.filter((sale) => sale.leadId && assigned.has(sale.leadId))
          .length) /
      sales.length
    : relevantLeads.length
      ? (100 * assigned.size) / relevantLeads.length
      : null;
  const coveredCrm =
    hasCrm &&
    period.from >= s.initialSince.slice(0, 10) &&
    dateAt(s.crm.state.lastSuccessAt!, period.timezone) >= period.to;
  return {
    metrics: result,
    coverage: {
      meta: coverageMeta,
      crm: hasCrm ? (coveredCrm ? 100 : 50) : null,
      attribution: attributionCoverage,
      creative: null,
    },
    limitations: [
      ...(!compatible
        ? [
            "Mídia Meta ausente ou moeda/fuso incompatível; não estimamos investimento.",
          ]
        : []),
      ...(!hasCrm ? ["CRM ainda não possui sincronização válida."] : []),
      ...(!coveredCrm ? ["Cobertura temporal comercial incompleta."] : []),
      "Calls e responsáveis usam snapshots atuais; comparações históricas são observacionais.",
      "Alcance e frequência não são somados entre dias/anúncios.",
      ...(attributionCoverage !== null && attributionCoverage < 80
        ? [
            `Somente ${Math.round(attributionCoverage)}% da base possui atribuição exact/strong.`,
          ]
        : []),
    ],
  };
}
export function buildInputs(
  workspaceId: string,
  s: DataSources,
  key: WindowKey,
  now: number,
): AnalysisInput[] {
  const p = periods(key, now, s.timezone),
    entities = new Map<
      string,
      { type: AnalysisInput["entityType"]; id: string; name: string }
    >();
  entities.set("workspace", {
    type: "workspace",
    id: workspaceId,
    name: s.name,
  });
  for (const kind of ["campaign", "creative"] as const) {
    for (const l of s.crm.leads) {
      const id = dimension(l, kind);
      if (id) entities.set(kind + id, { type: kind, id, name: id });
    }
    for (const r of s.meta?.resources.filter(
      (r) => r.kind === (kind === "campaign" ? "campaigns" : "creatives"),
    ) || [])
      entities.set(kind + "meta:" + r.id, {
        type: kind,
        id: "meta:" + r.id,
        name: String(r.payload.name || r.id),
      });
  }
  return [...entities.values()].map((e) => {
    const a = sourceMetrics(s, p.current, e.type, e.id),
      b = sourceMetrics(s, p.previous, e.type, e.id);
    return {
      workspaceId,
      entityType: e.type,
      entityId: e.id,
      name: e.name,
      mode: "real",
      current: a.metrics,
      previous: b.metrics,
      period: p.current,
      previousPeriod: p.previous,
      series: Array.from({ length: p.current.days }, (_, i) => {
        const day = shift(p.current.from, i);
        return {
          day,
          metrics: sourceMetrics(
            s,
            { from: day, to: day, days: 1, timezone: s.timezone },
            e.type,
            e.id,
          ).metrics,
        };
      }),
      coverage: a.coverage,
      limitations: [
        ...a.limitations,
        ...(p.current.to === dateAt(now, s.timezone)
          ? ["Hoje é um dia parcial; a análise não autoriza execução."]
          : []),
        ...(b.coverage.crm !== 100
          ? ["Período comercial anterior incompleto."]
          : []),
      ],
      lastChangedAt: null,
      learning: false,
      now,
    };
  });
}

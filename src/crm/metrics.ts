import type { CrmSnapshot, Entity } from "./types";
import type { MetaSnapshot, StoredResource } from "../meta/types";
import { add, decimal, divide, percent } from "./decimal";
import { dimension, mediaMatch, attribution } from "./attribution";
export interface FunnelFilter {
  from: string;
  to: string;
  timezone?: string;
  campaign?: string;
  adset?: string;
  ad?: string;
  creative?: string;
  seller?: string;
}
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const day = (date: string, f: FunnelFilter) => {
  if (date.length === 10) return date;
  const zone = f.timezone || "UTC";
  let formatter = dateFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(zone, formatter);
  }
  return formatter.format(new Date(date));
};
const during = (date: string | null | undefined, f: FunnelFilter) =>
  !!date && day(date, f) >= f.from && day(date, f) <= f.to;
export function businessMetrics(
  data: CrmSnapshot,
  meta: MetaSnapshot | null,
  f: FunnelFilter,
) {
  const matches = (l: Entity) =>
    Object.entries({
      campaign: f.campaign,
      adset: f.adset,
      ad: f.ad,
      creative: f.creative,
    }).every(([kind, v]) => !v || dimension(l, kind as "campaign") === v);
  const matching = data.leads.filter(matches),
    ids = new Set(matching.map((l) => l.id));
  const hasLeadFilter = !!(f.campaign || f.adset || f.ad || f.creative);
  const visible = matching.filter(
    (l) => !f.seller || l.fields.seller_id === f.seller,
  );
  const byId = new Map(matching.map((l) => [l.id, l]));
  const belongs = (e: Entity) =>
    (e.leadId ? ids.has(e.leadId) : !hasLeadFilter) &&
    (!f.seller ||
      (e.fields.seller_id ??
        (e.leadId ? byId.get(e.leadId)?.fields.seller_id : null)) === f.seller);
  const leads = visible.filter((l) =>
    during(l.fields.created_at || l.originAt, f),
  );
  const qualified = visible.filter((l) => during(l.fields.qualified_at, f));
  const cohortQualified = leads.filter(
    (l) => !!l.fields.qualified_at && day(l.fields.qualified_at, f) <= f.to,
  );
  const calls = data.calls.filter(belongs),
    scheduled = calls.filter((c) => during(c.fields.first_scheduled_at, f)),
    completed = calls.filter(
      (c) =>
        c.fields.call_status === "completed" &&
        during(c.fields.completed_at, f),
    ),
    noShows = calls.filter(
      (c) =>
        c.fields.call_status === "no_show" && during(c.fields.no_show_at, f),
    );
  const proposals = data.proposals.filter(
      (e) => belongs(e) && during(e.originAt, f),
    ),
    sales = data.sales.filter((e) => belongs(e) && during(e.originAt, f));
  const knownRevenue = sales.reduce(
    (n, s) =>
      s.fields.sale_value !== undefined && s.fields.sale_value !== null
        ? add(n, s.fields.sale_value)
        : n,
    "0",
  );
  const missingValues = sales.filter((s) => s.fields.sale_value == null).length;
  const revenue = missingValues ? null : knownRevenue;
  const buyers = new Set(sales.map((s) => s.leadId).filter(Boolean));
  const cohortBuyerCount = leads.filter((l) =>
    data.sales.some((s) => s.leadId === l.id && day(s.originAt, f) <= f.to),
  ).length;
  let investment: string | null = null,
    attributedRevenue: string | null = null,
    mediaNote =
      "Sem investimento Meta compatível. Dados comerciais permanecem disponíveis.";
  let attributableLeads: Entity[] = [],
    attributableSales: Entity[] = [];
  let mediaRows: StoredResource[] = [];
  if (
    meta?.connection &&
    !f.seller &&
    data.state.lastSuccessAt &&
    data.state.status === "connected" &&
    data.state.lastSyncStatus === "success"
  ) {
    const selected = meta.accounts.filter((a) => a.selected);
    const compatible =
      selected.length > 0 &&
      selected.every(
        (a) =>
          a.currency === data.currency && a.timezone === (f.timezone || "UTC"),
      );
    // CRM dates use the workspace timezone; Meta daily rows must use that same timezone.
    if (compatible) {
      const available = meta.resources.filter(
        (r) => r.kind === "insights" && during(r.date, f),
      );
      const mapping = new Map(matching.map((l) => [l.id, mediaMatch(l, meta)]));
      const exactKeys = new Set(
        [...mapping.values()]
          .flat()
          .map((r) => `${r.accountId}:${r.id}:${r.date}`),
      );
      mediaRows = hasLeadFilter
        ? available.filter((r) =>
            exactKeys.has(`${r.accountId}:${r.id}:${r.date}`),
          )
        : available;
      if (
        mediaRows.length &&
        mediaRows.every((r) => typeof r.payload.spend === "string")
      ) {
        try {
          investment = mediaRows.reduce(
            (n, r) => add(n, decimal(r.payload.spend)),
            "0",
          );
        } catch {
          investment = null;
        }
      }
      const covered = new Set(mediaRows.map((r) => `${r.accountId}:${r.id}`));
      const attributed = (id: string) =>
        mapping.get(id)?.some((r) => covered.has(`${r.accountId}:${r.id}`));
      attributableLeads = matching.filter((l) => attributed(l.id));
      attributableSales = sales.filter((s) => s.leadId && attributed(s.leadId));
      attributedRevenue =
        (attributableLeads.length === 0 && sales.length > 0) ||
        attributableSales.some((s) => s.fields.sale_value == null)
          ? null
          : attributableSales.reduce(
              (n, s) => add(n, s.fields.sale_value!),
              "0",
            );
      mediaNote =
        "Eficiência usa somente conversões com IDs confirmados nos dados Meta selecionados. Receita total e atribuída são separadas; datas no mesmo fuso.";
    } else
      mediaNote =
        "Eficiência indisponível: moeda ou fuso Meta não coincide com o fuso comercial selecionado. Não somamos bases incompatíveis.";
  }
  if (f.seller)
    mediaNote =
      "Investimento por vendedor não existe na Meta; CAC e ROAS não são rateados artificialmente.";
  const attributedIds = new Set(attributableLeads.map((l) => l.id));
  const cost = (n: number) =>
    investment !== null ? divide(investment, String(n), 2) : null;
  const aLeads = leads.filter((l) => attributedIds.has(l.id)).length,
    aQualified = qualified.filter((l) => attributedIds.has(l.id)).length;
  const ac = (c: Entity) => !!c.leadId && attributedIds.has(c.leadId);
  const aBuyers = new Set(attributableSales.map((s) => s.leadId)).size;
  return {
    leads: leads.length,
    qualified: qualified.length,
    qualificationRate: percent(cohortQualified.length, leads.length),
    scheduled: scheduled.length,
    completed: completed.length,
    noShows: noShows.length,
    showRate: percent(completed.length, completed.length + noShows.length),
    proposals: proposals.length,
    sales: sales.length,
    buyers: buyers.size,
    closeRate: percent(cohortBuyerCount, leads.length),
    revenue,
    knownRevenue,
    missingValues,
    averageTicket:
      revenue === null ? null : divide(revenue, String(sales.length), 2),
    investment,
    attributedRevenue,
    attributedSales: attributableSales.length,
    cpl: cost(aLeads),
    costQualified: cost(aQualified),
    costScheduled: cost(scheduled.filter(ac).length),
    costCompleted: cost(completed.filter(ac).length),
    costProposal: cost(proposals.filter(ac).length),
    cac: cost(aBuyers),
    roas:
      investment !== null && attributedRevenue !== null
        ? divide(attributedRevenue, investment)
        : null,
    mediaNote,
    unattributed: leads.filter((l) => attribution(l).status === "unattributed")
      .length,
    leadRows: leads,
  };
}
export function formatMoney(value: string | null, currency: string) {
  if (value === null) return "Não disponível";
  const [a, b = ""] = value.split(".");
  return `${currency} ${a!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${b.padEnd(2, "0")}`;
}

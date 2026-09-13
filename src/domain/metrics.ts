import type { DailyMetric } from "./types";

export const DEMO_END = "2026-09-12";
export function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}
export function aggregate(rows: DailyMetric[]) {
  const totals = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      leads: a.leads + r.leads,
      sales: a.sales + r.sales,
      reach: a.reach + r.reach,
      revenue: a.revenue + r.revenue,
    }),
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
      sales: 0,
      reach: 0,
      revenue: 0,
    },
  );
  return {
    ...totals,
    cpl: ratio(totals.spend, totals.leads),
    ctr: ratio(totals.clicks, totals.impressions) * 100,
    cpm: ratio(totals.spend, totals.impressions) * 1000,
    frequency: ratio(totals.impressions, totals.reach),
    cpa: ratio(totals.spend, totals.sales),
    roas: ratio(totals.revenue, totals.spend),
  };
}
export type Metrics = ReturnType<typeof aggregate>;
export function dateOffset(days: number) {
  const date = new Date(`${DEMO_END}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function windowRows(
  rows: DailyMetric[],
  days: number,
  previous = false,
) {
  const end = dateOffset(previous ? -days : 0);
  const start = dateOffset(previous ? -2 * days + 1 : -days + 1);
  return rows.filter((row) => row.date >= start && row.date <= end);
}
export function change(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}
export function series(rows: DailyMetric[]) {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  return dates.map((date) => ({
    date,
    ...aggregate(rows.filter((r) => r.date === date)),
  }));
}
export const money = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
export const integer = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
export const decimal = (n: number) =>
  n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

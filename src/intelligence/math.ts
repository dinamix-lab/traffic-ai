import { divide, decimal } from "../crm/decimal";
import type { Metric, MetricKey, Metrics, Period, WindowKey } from "./types";
export const keys: MetricKey[] = [
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "ctr",
  "cpm",
  "cpc",
  "cpl",
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
  "clickLeadRate",
  "schedulingRate",
  "callProposalRate",
  "callSaleRate",
];
const money = new Set([
  "spend",
  "cpm",
  "cpc",
  "cpl",
  "revenue",
  "averageTicket",
  "costQualified",
  "costScheduled",
  "costCompleted",
  "costProposal",
  "cac",
]);
export function metric(
  key: MetricKey,
  value: string | number | null,
  source: Metric["source"] = "real",
  reason?: string,
): Metric {
  return {
    value: value === null ? null : String(value),
    source: value === null ? "missing" : source,
    unit: money.has(key)
      ? "money"
      : key.endsWith("Rate") || key === "ctr"
        ? "percent"
        : ["frequency", "roas"].includes(key)
          ? "ratio"
          : "count",
    ...(reason ? { reason } : {}),
  };
}
export function emptyMetrics(
  reason = "Fonte ou métrica não disponível.",
): Metrics {
  return Object.fromEntries(
    keys.map((k) => [k, metric(k, null, "missing", reason)]),
  ) as Metrics;
}
export function numeric(m: Metric): number | null {
  if (m.value === null || m.unit === "money") return null;
  const n = Number(m.value);
  return Number.isFinite(n) ? n : null;
}
export function relative(a: string | null, b: string | null): number | null {
  if (a === null || b === null) return null;
  const ratio = divide(a, b, 6);
  return ratio === null ? null : Math.round((Number(ratio) - 1) * 10000) / 100;
}
export function compare(a: string, b: string) {
  const scaled = (v: string) => {
    const [x, y = ""] = decimal(v).split(".");
    return BigInt(x!) * 10n ** 18n + BigInt(y.padEnd(18, "0"));
  };
  const x = scaled(a),
    y = scaled(b);
  return x === y ? 0 : x > y ? 1 : -1;
}
export const median = (values: number[]) => {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  return a.length % 2
    ? a[Math.floor(a.length / 2)]!
    : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2;
};
export function trend(values: (number | null)[]) {
  const a = values.filter((v): v is number => v !== null);
  if (a.length < 3)
    return {
      movingAverage: null,
      slope: null,
      acceleration: null,
      volatility: null,
      stable: null,
    };
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const vol =
    mean === 0
      ? 0
      : Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length) / mean;
  const differences = a.slice(1).map((x, i) => x - a[i]!);
  return {
    movingAverage:
      a.slice(-3).reduce((x, y) => x + y, 0) / Math.min(3, a.length),
    slope: (a.at(-1)! - a[0]!) / (a.length - 1),
    acceleration: differences.at(-1)! - differences[0]!,
    volatility: vol,
    stable: vol < 0.15,
  };
}
export const dateAt = (now: number, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
export const shift = (date: string, days: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export function periods(
  key: WindowKey,
  now: number,
  timezone: string,
): { current: Period; previous: Period } {
  const days = ["today", "yesterday"].includes(key) ? 1 : Number(key);
  if (![1, 3, 7, 14, 30].includes(days)) throw Error("Janela inválida");
  const to = shift(dateAt(now, timezone), key === "today" ? 0 : -1),
    from = shift(to, 1 - days);
  return {
    current: { from, to, days, timezone },
    previous: { from: shift(from, -days), to: shift(from, -1), days, timezone },
  };
}

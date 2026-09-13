import type { Decisions, Goals } from "./types";
export const defaultGoals: Goals = {
  maxCpl: 40,
  targetCpa: 420,
  targetRoas: 4,
  dailyBudget: 4000,
  qualificationRate: 35,
  averageTicket: 2400,
};
export function validGoals(value: unknown): value is Goals {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(defaultGoals).every(
      (key) =>
        typeof record[key] === "number" &&
        Number.isFinite(record[key]) &&
        (record[key] as number) > 0,
    ) && (record.qualificationRate as number) <= 100
  );
}
export function validDecisions(value: unknown): value is Decisions {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, v]) =>
        /^rec-\d+$/.test(key) && (v === "approved" || v === "ignored"),
    )
  );
}
export function readStored<T>(
  raw: string | null,
  fallback: T,
  validate: (value: unknown) => value is T,
): T {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

import { AuthError } from "../auth/errors";
import type { CrmConfig } from "./types";
export const CRM_BASE = "https://arkom-crm-ia.replit.app/api/traffic-ai";
export function crmConfig(
  env: Record<string, string | undefined> = process.env,
): CrmConfig {
  const key = env.DINAMIX_TRAFFIC_AI_API_KEY || "";
  const since = env.DINAMIX_CRM_INITIAL_SINCE || "2026-01-01T00:00:00.000Z";
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(since) ||
    !Number.isFinite(Date.parse(since))
  )
    throw new AuthError("Data inicial CRM inválida; use ISO-8601 UTC.", 503);
  const seconds = Number(env.DINAMIX_CRM_POLL_SECONDS || 120);
  if (!Number.isInteger(seconds) || seconds < 30 || seconds > 86400)
    throw new AuthError(
      "Polling CRM deve estar entre 30 e 86400 segundos.",
      503,
    );
  const currency = env.DINAMIX_CRM_CURRENCY || "BRL";
  if (!["BRL", "USD", "EUR"].includes(currency))
    throw new AuthError("Moeda CRM inválida.", 503);
  return {
    key,
    workspaceSlug: env.DINAMIX_CRM_WORKSPACE_SLUG || "dinamix-eletricos",
    since,
    pollMs: seconds * 1000,
    currency,
  };
}

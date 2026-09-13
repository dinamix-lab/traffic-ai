import type { Entity } from "./types";
import type { MetaSnapshot, StoredResource } from "../meta/types";
export function attribution(e: Pick<Entity, "attribution">) {
  const a = e.attribution;
  if (["campaign", "adset", "ad", "creative"].some((k) => a[`traffic_${k}_id`]))
    return { status: "exact", method: "traffic_ids" } as const;
  if (["campaign", "adset", "ad", "creative"].some((k) => a[`meta_${k}_id`]))
    return { status: "strong", method: "meta_ids" } as const;
  if (Object.keys(a).some((k) => k.startsWith("utm_") && a[k]))
    return { status: "partial", method: "utm" } as const;
  if (a.source) return { status: "partial", method: "source" } as const;
  return { status: "unattributed", method: "unknown" } as const;
}
export function dimension(
  e: Entity,
  kind: "campaign" | "adset" | "ad" | "creative",
) {
  const a = e.attribution;
  return a[`traffic_${kind}_id`]
    ? `traffic:${a[`traffic_${kind}_id`]}`
    : a[`meta_${kind}_id`]
      ? `meta:${a[`meta_${kind}_id`]}`
      : kind === "campaign" && a.utm_campaign
        ? `utm:${a.utm_campaign}`
        : kind === "creative" && a.utm_content
          ? `utm:${a.utm_content}`
          : null;
}
// Resolve only IDs present in imported resources, never campaign names or fuzzy UTMs.
export function mediaMatch(lead: Entity, meta: MetaSnapshot): StoredResource[] {
  const a = lead.attribution;
  const prefix =
    attribution(lead).method === "traffic_ids" ? "traffic" : "meta";
  const known = meta.resources;
  let rows = known.filter((r) => r.kind === "insights");
  let evidence = false;
  for (const [kind, field] of [
    ["campaign", "campaign_id"],
    ["adset", "adset_id"],
    ["ad", "ad_id"],
  ] as const) {
    const id = a[`${prefix}_${kind}_id`];
    if (!id) continue;
    const resourceKind =
      kind === "campaign" ? "campaigns" : kind === "adset" ? "adsets" : "ads";
    if (!known.some((r) => r.kind === resourceKind && r.id === id)) return [];
    rows = rows.filter((r) => r.payload[field] === id);
    evidence = true;
  }
  const creative = a[`${prefix}_creative_id`];
  if (creative) {
    const ads = new Set(
      known
        .filter(
          (r) =>
            r.kind === "ads" &&
            (r.payload.creative as { id?: string } | undefined)?.id ===
              creative,
        )
        .map((r) => `${r.accountId}:${r.id}`),
    );
    rows = rows.filter((r) => ads.has(`${r.accountId}:${r.id}`));
    evidence = true;
  }
  return evidence ? rows : [];
}

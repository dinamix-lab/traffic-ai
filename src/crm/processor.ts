import { attribution } from "./attribution";
import {
  eventTypes,
  type CrmEvent,
  type Entity,
  type EntityKind,
  type CrmRepository,
  type Version,
} from "./types";
import { decimal } from "./decimal";
import { CrmError } from "./client";
export const attributionFields = [
  "source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "meta_campaign_id",
  "meta_adset_id",
  "meta_ad_id",
  "meta_creative_id",
  "traffic_workspace_id",
  "traffic_campaign_id",
  "traffic_adset_id",
  "traffic_ad_id",
  "traffic_creative_id",
];
const permitted = [
  "event_id",
  "tenant_id",
  "sequence",
  "event_type",
  "schema_version",
  "occurred_at",
  "updated_at",
  "lead_id",
  "seller_id",
  "call_id",
  "proposal_id",
  "sale_id",
  ...attributionFields,
  "status",
  "qualification_status",
  "seller_name",
  "loss_reason",
  "call_scheduled_at",
  "call_ended_at",
  "call_status",
  "proposal_status",
  "proposal_value",
  "sale_value",
  "produto_oferta",
];
const dates = new Set([
  "occurred_at",
  "updated_at",
  "call_scheduled_at",
  "call_ended_at",
]);
export function normalizeEvent(raw: unknown): CrmEvent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new CrmError("contract");
  const result: Record<string, string | null> = {};
  for (const key of permitted) {
    let val = (raw as Record<string, unknown>)[key];
    if (val === undefined) continue;
    if (val === null) {
      result[key] = null;
      continue;
    }
    if (key === "proposal_value" || key === "sale_value") {
      try {
        val = decimal(val);
      } catch {
        throw new CrmError("contract");
      }
    } else if (typeof val === "number" && Number.isSafeInteger(val))
      val = String(val);
    if (typeof val !== "string" || val.length > 2048)
      throw new CrmError("contract");
    if (dates.has(key)) {
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(val) ||
        !Number.isFinite(Date.parse(val))
      )
        throw new CrmError("contract");
      val = new Date(val).toISOString();
    }
    result[key] = String(val);
  }
  if (
    !result.event_id ||
    !result.occurred_at ||
    !eventTypes.includes(result.event_type as CrmEvent["event_type"])
  )
    throw new CrmError("contract");
  if (result.sequence && !/^\d+$/.test(result.sequence))
    throw new CrmError("contract");
  if (result.schema_version && !["1", "1.0"].includes(result.schema_version))
    throw new CrmError("contract");
  return result as CrmEvent;
}
const version = (e: CrmEvent): Version => ({
  at: e.updated_at || e.occurred_at,
  sequence: e.sequence,
  eventId: e.event_id,
});
function newer(a: Version, b?: Version) {
  if (!b) return true;
  if (a.sequence && b.sequence && a.sequence !== b.sequence)
    return BigInt(a.sequence) > BigInt(b.sequence);
  return a.at >= b.at;
}
function assign(entity: Entity, key: string, value: string | null, v: Version) {
  if (newer(v, entity.versions[key])) {
    entity.fields[key] = value;
    entity.versions[key] = v;
    entity.lastEventId = v.eventId;
  }
}
function load(
  store: CrmRepository,
  w: string,
  kind: EntityKind,
  id: string,
  e: CrmEvent,
): Entity {
  const old = store.entity(w, kind, id);
  if (old?.leadId && e.lead_id && old.leadId !== e.lead_id)
    throw new CrmError("contract");
  return (
    old || {
      id,
      leadId: e.lead_id || null,
      fields: {},
      versions: {},
      attribution: {},
      originAt: e.occurred_at,
      lastEventId: e.event_id,
    }
  );
}
function updateLead(store: CrmRepository, w: string, e: CrmEvent) {
  if (!e.lead_id) return;
  const lead = load(store, w, "leads", e.lead_id, e),
    v = version(e);
  lead.leadId = e.lead_id;
  // Acquisition evidence is immutable once known, except an earlier event can establish the original source.
  const earlier = e.occurred_at < lead.originAt;
  if (earlier) lead.originAt = e.occurred_at;
  for (const key of attributionFields)
    if (e[key] && (earlier || !lead.attribution[key]))
      lead.attribution[key] = e[key]!;
  for (const key of [
    "seller_id",
    "seller_name",
    "status",
    "qualification_status",
    "loss_reason",
  ])
    if (e[key] !== undefined) assign(lead, key, e[key] ?? null, v);
  if (e.event_type === "lead_created") {
    const date = lead.fields.created_at;
    if (!date || e.occurred_at < date) lead.fields.created_at = e.occurred_at;
  }
  if (e.event_type === "lead_qualified") {
    if (!lead.fields.qualified_at || e.occurred_at < lead.fields.qualified_at)
      lead.fields.qualified_at = e.occurred_at;
    if (e.qualification_status === undefined)
      assign(lead, "qualification_status", "qualified", v);
  }
  if (e.event_type === "lead_lost") {
    assign(lead, "lost_at", e.occurred_at, v);
    if (e.status === undefined) assign(lead, "status", "lost", v);
  }
  const resolved = attribution(lead);
  lead.fields.attribution_status = resolved.status;
  lead.fields.attribution_method = resolved.method;
  assign(lead, "updated_at", e.updated_at || e.occurred_at, v);
  store.saveEntity(w, "leads", lead);
}
type Handler = (store: CrmRepository, w: string, e: CrmEvent) => void;
const leadHandler: Handler = (store, w, e) => {
  if (!e.lead_id) throw new CrmError("contract");
  updateLead(store, w, e);
};
const callHandler =
  (status: string): Handler =>
  (store, w, e) => {
    if (!e.call_id) throw new CrmError("contract");
    updateLead(store, w, e);
    const call = load(store, w, "calls", e.call_id, e);
    call.leadId = call.leadId || e.lead_id || null;
    const v = version(e);
    for (const key of [
      "seller_id",
      "seller_name",
      "call_scheduled_at",
      "call_ended_at",
    ])
      if (e[key] !== undefined) assign(call, key, e[key] ?? null, v);
    assign(call, "call_status", status, v);
    assign(call, "status_at", e.occurred_at, v);
    if (
      status === "scheduled" &&
      (!call.fields.first_scheduled_at ||
        e.occurred_at < call.fields.first_scheduled_at)
    )
      call.fields.first_scheduled_at = e.occurred_at;
    if (status === "completed")
      assign(call, "completed_at", e.call_ended_at || e.occurred_at, v);
    if (status === "no_show") assign(call, "no_show_at", e.occurred_at, v);
    if (status === "cancelled") assign(call, "cancelled_at", e.occurred_at, v);
    store.saveEntity(w, "calls", call);
  };
const entityHandler =
  (
    kind: "proposals" | "sales",
    idField: "proposal_id" | "sale_id",
    keys: string[],
  ): Handler =>
  (store, w, e) => {
    if (!e[idField]) throw new CrmError("contract");
    updateLead(store, w, e);
    const row = load(store, w, kind, e[idField]!, e);
    row.leadId = row.leadId || e.lead_id || null;
    if (e.occurred_at < row.originAt) row.originAt = e.occurred_at;
    for (const key of keys)
      if (e[key] !== undefined) assign(row, key, e[key] ?? null, version(e));
    store.saveEntity(w, kind, row);
  };
export const handlers: Record<CrmEvent["event_type"], Handler> = {
  lead_created: leadHandler,
  lead_updated: leadHandler,
  lead_qualified: leadHandler,
  lead_lost: leadHandler,
  call_scheduled: callHandler("scheduled"),
  call_completed: callHandler("completed"),
  call_no_show: callHandler("no_show"),
  call_cancelled: callHandler("cancelled"),
  proposal_created: entityHandler("proposals", "proposal_id", [
    "seller_id",
    "seller_name",
    "proposal_status",
    "proposal_value",
  ]),
  sale_completed: entityHandler("sales", "sale_id", [
    "seller_id",
    "seller_name",
    "sale_value",
    "produto_oferta",
  ]),
};
export function processEvent(store: CrmRepository, w: string, e: CrmEvent) {
  if (e.traffic_workspace_id && e.traffic_workspace_id !== w)
    throw new CrmError("contract");
  if (store.processed(w, e.event_id)) return false;
  handlers[e.event_type](store, w, e);
  store.record(w, e);
  return true;
}

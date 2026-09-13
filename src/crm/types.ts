export const eventTypes = [
  "lead_created",
  "lead_updated",
  "lead_qualified",
  "lead_lost",
  "call_scheduled",
  "call_completed",
  "call_no_show",
  "call_cancelled",
  "proposal_created",
  "sale_completed",
] as const;
export type EventType = (typeof eventTypes)[number];
export type EntityKind = "leads" | "calls" | "proposals" | "sales";
export interface CrmEvent {
  event_id: string;
  event_type: EventType;
  occurred_at: string;
  updated_at?: string;
  sequence?: string;
  tenant_id?: string;
  schema_version?: string;
  [key: string]: string | null | undefined;
}
export interface EventPage {
  events: unknown[];
  next_cursor: string | null;
  has_more: boolean;
}
export interface Version {
  at: string;
  sequence?: string;
  eventId: string;
}
export interface Entity {
  id: string;
  leadId: string | null;
  fields: Record<string, string | null>;
  versions: Record<string, Version>;
  attribution: Record<string, string>;
  originAt: string;
  lastEventId: string;
}
export interface CrmState {
  credentialFingerprint?: string;
  authRejected?: boolean;
  lastSyncStatus?: "success" | "error";
  workspaceId: string;
  integrationName: "dinamix-vendas";
  cursor: string | null;
  tenantId: string | null;
  status: "disconnected" | "connected" | "error" | "syncing";
  lastHealthAt: number | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  apiVersion: string | null;
  totalEvents: number;
  lastEvents: number;
  nextAttemptAt: number;
  leaseOwner: string | null;
  leaseUntil: number;
}
export interface CrmRun {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  events: number;
  pages: number;
  status: "running" | "success" | "error";
  error: string | null;
}
export interface CrmProvider {
  health(): Promise<{ status: "ok"; service: "crm"; version: string }>;
  events(
    query:
      { since: string; cursor?: never } | { cursor: string; since?: never },
  ): Promise<EventPage>;
}
export interface CrmRepository {
  transaction<T>(fn: () => T): T;
  state(workspaceId: string): CrmState;
  saveState(state: CrmState): void;
  acquire(
    workspaceId: string,
    owner: string,
    now: number,
    leaseMs: number,
  ): boolean;
  renew(workspaceId: string, owner: string, now: number, leaseMs: number): void;
  assertLease(workspaceId: string, owner: string, now: number): void;
  release(workspaceId: string, owner: string): void;
  processed(workspaceId: string, eventId: string): boolean;
  record(workspaceId: string, event: CrmEvent): void;
  entity(workspaceId: string, kind: EntityKind, id: string): Entity | null;
  saveEntity(workspaceId: string, kind: EntityKind, entity: Entity): void;
  entities(workspaceId: string, kind: EntityKind): Entity[];
  saveRun(workspaceId: string, run: CrmRun): void;
  runs(workspaceId: string): CrmRun[];
  history(workspaceId: string): CrmEvent[];
  reserveRequest(now: number): number;
  deferRequests(until: number): void;
}
export interface CrmConfig {
  key: string;
  workspaceSlug: string;
  since: string;
  pollMs: number;
  currency: string;
}
export interface CrmSnapshot {
  configured: boolean;
  bound: boolean;
  currency: string;
  state: Omit<
    CrmState,
    | "cursor"
    | "tenantId"
    | "leaseOwner"
    | "leaseUntil"
    | "workspaceId"
    | "credentialFingerprint"
    | "authRejected"
  > & { hasCursor: boolean };
  runs: CrmRun[];
  leads: Entity[];
  calls: Entity[];
  proposals: Entity[];
  sales: Entity[];
}
export interface BusinessScoreFoundation {
  version: null;
  score: null;
  inputs: (
    | "lead_quality"
    | "calls"
    | "proposals"
    | "sales"
    | "revenue"
    | "media_efficiency"
  )[];
}

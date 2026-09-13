export interface TrackingIdentity {
  workspaceId: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  creativeId?: string;
}
export interface UtmParameters {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}
export type FunnelStage =
  | "click"
  | "lead"
  | "qualified_lead"
  | "call_scheduled"
  | "call_completed"
  | "no_show"
  | "proposal"
  | "sale"
  | "revenue";
export interface BusinessEvent {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  occurredAt: string;
  stage: FunnelStage;
  leadId?: string;
  clickId?: string;
  tracking: TrackingIdentity;
  amountMinor?: number;
  currency?: string;
  source: "crm" | "website" | "manual";
  attributionModel: string;
  consentReference?: string;
}
export interface BusinessEventRepository {
  append(event: BusinessEvent): Promise<void>;
  list(
    workspaceId: string,
    since: string,
    until: string,
  ): Promise<BusinessEvent[]>;
}
export interface CreativeOrigin {
  workspaceId: string;
  creativeId: string;
  platformMediaId?: string;
  platformPostId?: string;
  platform: "facebook" | "instagram";
  format: "image" | "video" | "carousel" | "reel" | "unknown";
  publishedAt?: string;
  organicObservationStart?: string;
  organicObservationEnd?: string;
  paidTestProposalId?: string;
}
export interface TrackingService {
  buildUrl(
    destination: string,
    identity: TrackingIdentity,
    utm: UtmParameters,
  ): string;
}

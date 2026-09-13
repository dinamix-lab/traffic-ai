export const actions = [
  "SCALE",
  "MAINTAIN",
  "REDUCE_BUDGET",
  "PAUSE",
  "TEST_NEW_CREATIVE",
  "REPLACE_CREATIVE",
  "WAIT_FOR_DATA",
  "INVESTIGATE_LEAD_QUALITY",
  "INVESTIGATE_SALES_PROCESS",
  "INVESTIGATE_LANDING_PAGE",
] as const;
export type Action = (typeof actions)[number];
export type Sufficiency = "INSUFFICIENT" | "LOW" | "MODERATE" | "STRONG";
export type Origin = "real" | "manual" | "demo" | "missing";
export type WindowKey = "today" | "yesterday" | "3" | "7" | "14" | "30";
export interface Period {
  from: string;
  to: string;
  days: number;
  timezone: string;
}
export interface Metric {
  value: string | null;
  source: Origin;
  unit: "count" | "money" | "percent" | "ratio";
  reason?: string;
}
export type MetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "frequency"
  | "clicks"
  | "ctr"
  | "cpm"
  | "cpc"
  | "cpl"
  | "leads"
  | "qualified"
  | "qualificationRate"
  | "scheduled"
  | "completed"
  | "noShows"
  | "showRate"
  | "proposals"
  | "sales"
  | "closeRate"
  | "revenue"
  | "averageTicket"
  | "costQualified"
  | "costScheduled"
  | "costCompleted"
  | "costProposal"
  | "cac"
  | "roas"
  | "clickLeadRate"
  | "schedulingRate"
  | "callProposalRate"
  | "callSaleRate";
export type Metrics = Record<MetricKey, Metric>;
export interface Coverage {
  meta: number | null;
  crm: number | null;
  attribution: number | null;
  creative: number | null;
}
export interface SeriesPoint {
  day: string;
  metrics: Metrics;
}
export interface AnalysisInput {
  workspaceId: string;
  entityType: "workspace" | "campaign" | "creative";
  entityId: string;
  name: string;
  mode: "real" | "demo";
  current: Metrics;
  previous: Metrics;
  period: Period;
  previousPeriod: Period;
  series: SeriesPoint[];
  coverage: Coverage;
  limitations: string[];
  lastChangedAt: number | null;
  learning: boolean;
  now: number;
}
export interface Evidence {
  metric: MetricKey;
  current: string;
  previous: string | null;
  change: number | null;
  statement: string;
  source: Origin;
}
export type Bottleneck =
  | "CREATIVE"
  | "MEDIA"
  | "LANDING_PAGE"
  | "LEAD_QUALITY"
  | "SCHEDULING"
  | "SHOW_RATE"
  | "SALES"
  | "CLOSING"
  | "ATTRIBUTION"
  | "INSUFFICIENT_DATA";
export interface Recommendation {
  id: string;
  workspaceId: string;
  entityType: AnalysisInput["entityType"];
  entityId: string;
  entityName: string;
  type: Action;
  title: string;
  summary: string;
  evidence: Evidence[];
  diagnosis: string;
  probableCause: string;
  businessImpact: string;
  suggestedAction: string;
  confidenceScore: number;
  confidenceLevel: "baixa" | "moderada" | "alta" | "muito alta";
  dataSufficiency: Sufficiency;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  createdAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "rejected" | "expired" | "superseded";
  mode: "real" | "demo";
  rule: string;
  ruleVersion: string;
  period: Period;
  before: Metrics;
  previous: Metrics;
  coverage: Coverage;
  limitations: string[];
  conflicts: string[];
  bottleneck: Bottleneck | null;
  estimatedImpact: {
    value: string | null;
    impactType: string;
    calculationMethod: string;
    confidence: number;
  };
  blockedBy: string[];
}
export interface Outcome {
  status: "positive" | "neutral" | "negative" | "inconclusive";
  checkedAt: number;
  after: Metrics | null;
  changes: Partial<Record<MetricKey, number | null>>;
  note: string;
}
export interface Decision {
  id: string;
  workspaceId: string;
  recommendationId: string;
  actorId: string;
  actorName: string;
  at: number;
  decision: "approved" | "rejected";
  reason: string;
  note: string;
  recommendation: Recommendation;
  before: Metrics;
  outcome: Outcome;
  taskStatus: "open" | "done";
}
export const reelStates = [
  "published",
  "organic_observation",
  "organic_evaluated",
  "test_proposed",
  "test_approved",
  "paid_test_pending",
  "paid_testing",
  "scale_candidate",
  "maintain_candidate",
  "pause_candidate",
  "completed",
] as const;
export type ReelState = (typeof reelStates)[number];
export const organicKeys = [
  "views",
  "reach",
  "plays",
  "watchTime",
  "averageWatchTime",
  "retention",
  "likes",
  "comments",
  "shares",
  "saves",
  "profileVisits",
  "followers",
] as const;
export type OrganicMetrics = Record<
  (typeof organicKeys)[number],
  number | null
>;
export interface ScoreResult {
  value: number | null;
  sufficiency: Sufficiency;
  components: {
    name: string;
    value: number;
    weight: number;
    baseline: number | string | null;
  }[];
  explanation: string;
  version: string;
}
export interface Creative {
  id: string;
  workspaceId: string;
  title: string;
  profileId: string;
  platform: string;
  mediaType: string;
  publicationId: string | null;
  publishedAt: string | null;
  caption: string;
  duration: number | null;
  thumbnail: string | null;
  tags: string[];
  hook: string;
  angle: string;
  theme: string;
  format: string;
  presenter: string;
  cta: string;
  status: ReelState;
  source: "manual" | "demo";
  trafficCreativeId: string | null;
  metaCreativeId: string | null;
  organic: OrganicMetrics;
  organicAsOf: string | null;
  organicScore: ScoreResult;
  businessScore: ScoreResult;
  business: Metrics | null;
  paid: Metrics | null;
  confidence: number;
  recommendation: string;
  evaluatedAt: number | null;
  timeline: { at: number; state: ReelState; text: string; actorId: string }[];
}
export interface ReelTest {
  id: string;
  workspaceId: string;
  creativeId: string;
  type: "GROWTH" | "CONVERSION";
  budget: string;
  days: number;
  status: "proposed" | "rejected" | "paid_test_pending";
  trackingUrl: string;
  tracking: Record<string, string>;
  createdAt: number;
  decidedAt: number | null;
  actorId: string | null;
  reason: string;
  result: "winner" | "promising" | "neutral" | "loser" | "inconclusive";
  before: Metrics | null;
  during: Metrics | null;
  after: Metrics | null;
}
export interface Notification {
  id: string;
  workspaceId: string;
  at: number;
  message: string;
  entityId: string;
  readBy: string[];
}
export interface JournalEntry {
  id: string;
  workspaceId: string;
  day: string;
  at: number;
  mode: "real" | "demo";
  summary: string;
  metrics: Metrics;
  recommendations: string[];
  decisions: number;
  observing: number;
  testsActive: number;
  testsCompleted: number;
  risks: number;
  opportunities: number;
  bottlenecks: string[];
}
export interface Pattern {
  id: string;
  feature: string;
  status: "hypothesis" | "emerging" | "validated";
  creatives: number;
  leads: number;
  qualificationRate: number;
  baselineRate: number;
  change: number | null;
  confidence: number;
  note: string;
}
export interface Health {
  score: number | null;
  components: { name: string; score: number | null }[];
  note: string;
}
export interface Audit {
  id: string;
  workspaceId: string;
  actorId: string;
  at: number;
  entityId: string;
  action: string;
}

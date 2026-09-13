export type CampaignStatus = "Ativa" | "Pausada" | "Em aprendizado";
export interface Campaign {
  workspaceId: string;
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  budget: number;
  score: number;
  color: string;
}
export interface DailyMetric {
  workspaceId: string;
  date: string;
  campaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  sales: number;
  reach: number;
  revenue: number;
}
export interface Creative {
  workspaceId: string;
  id: string;
  name: string;
  campaignId: string;
  adSet: string;
  ad: string;
  format: string;
  headline: string;
  color: string;
  share: number;
  fatigue: boolean;
  score: number;
}
export interface Recommendation {
  workspaceId: string;
  id: string;
  campaignId: string;
  title: string;
  diagnosis: string;
  cause: string;
  impact: string;
  action: string;
  priority: "Alta" | "Média" | "Baixa";
  confidence: number;
  kind: string;
}
export type Decision = "approved" | "ignored";
export type Decisions = Record<string, Decision>;
export interface Goals {
  maxCpl: number;
  targetCpa: number;
  targetRoas: number;
  dailyBudget: number;
  qualificationRate: number;
  averageTicket: number;
}
export interface Lead {
  workspaceId: string;
  id: string;
  name: string;
  company: string;
  campaignId: string;
  creativeId: string;
  status: "Novo" | "Qualificado" | "Reunião" | "Proposta" | "Venda" | "Perdido";
  qualified: boolean;
  meeting: boolean;
  proposal: boolean;
  sale: boolean;
  value: number;
}
export interface Dataset {
  workspaceId: string;
  journal: { workspaceId: string; date: string }[];
  campaigns: Campaign[];
  daily: DailyMetric[];
  creatives: Creative[];
  recommendations: Recommendation[];
  leads: Lead[];
}
export interface TrafficRepository {
  getDataset(workspace: { id: string; name: string; currency?: string }): Promise<Dataset>;
}

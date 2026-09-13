import type { Goals } from "../domain/types";
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: number;
  description: string;
  timezone: string;
  currency: string;
}
export interface WorkspaceInput {
  name: string;
  slug: string;
  active: boolean;
  description: string;
  timezone: string;
  currency: string;
}
export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  name: string;
  active: boolean;
}
export interface WorkspaceSummary extends Workspace {
  managers: WorkspaceMember[];
  integrationCount: number;
}
export type IntegrationProvider =
  "meta" | "crm" | "google-ads" | "whatsapp" | "analytics";
export interface Integration {
  id: string;
  workspaceId: string;
  provider: IntegrationProvider;
  connected: boolean;
  simulated: true;
  connectedBy: string | null;
  businessManager: string | null;
  lastSyncAt: number | null;
}
export interface AdAccount {
  id: string;
  workspaceId: string;
  integrationId: string;
  externalId: string;
  name: string;
  active: boolean;
  syncEnabled: boolean;
  lastSyncAt: number | null;
  managerIds: string[];
}
export interface WorkspaceStore {
  transaction<T>(work: () => T): T;
  list(): Workspace[];
  get(id: string): Workspace | undefined;
  save(workspace: Workspace): void;
  hasMember(workspaceId: string, userId: string): boolean;
  members(workspaceId: string): WorkspaceMember[];
  setMembers(workspaceId: string, userIds: string[]): void;
  eligibleManagers(): { id: string; name: string; active: boolean }[];
  integrations(workspaceId: string): Integration[];
  saveIntegration(integration: Integration): void;
  accounts(workspaceId: string): AdAccount[];
  saveAccount(account: AdAccount): void;
  deleteAccounts(workspaceId: string): void;
  goals(workspaceId: string): Goals;
  saveGoals(workspaceId: string, goals: Goals): void;
}

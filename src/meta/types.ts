export type MetaRow = Record<string, unknown>;
export type ResourceKind =
  | "businesses"
  | "pages"
  | "instagram"
  | "pixels"
  | "campaigns"
  | "adsets"
  | "ads"
  | "creatives"
  | "insights";
export interface MetaAccount {
  id: string;
  name: string;
  status: number | null;
  currency: string | null;
  timezone: string | null;
  business: { id: string; name: string } | null;
  selected: boolean;
}
export interface Connection {
  workspaceId: string;
  revision: string;
  connected: boolean;
  userName: string;
  userId: string;
  expiresAt: number;
  lastSyncAt: number | null;
  health: string;
  permissions: string[];
}
export interface SyncRun {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  status: "running" | "success" | "partial" | "failed";
  imported: number;
  errors: string[];
}
export interface StoredResource {
  accountId: string;
  kind: ResourceKind;
  id: string;
  date: string;
  payload: MetaRow;
}
export interface MetaSnapshot {
  configured: boolean;
  configurationMessage: string;
  connection: Connection | null;
  accounts: MetaAccount[];
  resources: StoredResource[];
  runs: SyncRun[];
  events: { at: number; event: string }[];
}
export interface MetaProvider {
  exchange(code: string): Promise<{ token: string; expiresAt: number }>;
  get(
    token: string,
    path: string,
    params?: Record<string, string>,
  ): Promise<MetaRow>;
  list(
    token: string,
    path: string,
    params?: Record<string, string>,
  ): Promise<MetaRow[]>;
}
export interface MetaRepository {
  connection(workspaceId: string): Connection | null;
  credential(workspaceId: string): string | null;
  saveConnection(connection: Connection, encrypted: string): void;
  state(
    hash: string,
  ): { workspaceId: string; sessionHash: string; expiresAt: number } | null;
  putState(
    hash: string,
    workspaceId: string,
    sessionHash: string,
    expiresAt: number,
  ): void;
  consumeState(hash: string): boolean;
  accounts(workspaceId: string): MetaAccount[];
  saveAccounts(workspaceId: string, accounts: MetaAccount[]): void;
  resources(workspaceId: string): StoredResource[];
  replaceResources(
    workspaceId: string,
    accountId: string,
    kind: ResourceKind,
    rows: StoredResource[],
    since?: string,
  ): void;
  runs(workspaceId: string): SyncRun[];
  saveRun(workspaceId: string, run: SyncRun): void;
  event(workspaceId: string, event: string): void;
  events(workspaceId: string): { at: number; event: string }[];
  transaction<T>(fn: () => T): T;
  disconnect(workspaceId: string): void;
}

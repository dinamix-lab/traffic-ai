import type { AdAccount, Workspace } from "../workspaces/types";
export interface MetaOAuthAdapter {
  authorizationUrl(input: {
    workspaceId: string;
    state: string;
    redirectUri: string;
  }): Promise<string>;
  exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<{ secretReference: string; expiresAt: number }>;
  refreshToken(
    secretReference: string,
  ): Promise<{ secretReference: string; expiresAt: number }>;
}
export interface TokenVault {
  store(workspaceId: string, token: string): Promise<string>;
  read(reference: string): Promise<string>;
  revoke(reference: string): Promise<void>;
}
export interface MetaResource {
  id: string;
  name: string;
}
export type MetaResourceKind =
  | "business-managers"
  | "ad-accounts"
  | "pages"
  | "pixels"
  | "campaigns"
  | "ad-sets"
  | "ads"
  | "creatives"
  | "insights";
export interface MetaMarketingAdapter {
  list(input: {
    workspaceId: string;
    accountId?: string;
    kind: MetaResourceKind;
    cursor?: string;
    since?: string;
    secretReference: string;
  }): Promise<{ items: MetaResource[]; nextCursor?: string }>;
}
export interface IncrementalSync {
  run(input: {
    workspaceId: string;
    accountId: string;
    cursor?: string;
    idempotencyKey: string;
  }): Promise<{ nextCursor?: string; imported: number }>;
}
export interface DemoAccountsProvider {
  discover(
    workspace: Workspace,
    integrationId: string,
    now: number,
  ): AdAccount[];
}
// These interfaces deliberately have no real OAuth, vault, or HTTP implementation in this version.

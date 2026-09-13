import { SqliteAuthStore } from "../data/auth-sqlite";
import { SqliteWorkspaceStore } from "../data/workspace-sqlite";
import { SqliteCrmRepository } from "../data/crm-sqlite";
import { SqliteMetaRepository } from "../data/meta-sqlite";
import { SqliteIntelligenceRepository } from "../data/intelligence-sqlite";
import { AuthService } from "../auth/service";
import { WorkspaceService } from "../workspaces/service";
import { IntelligenceService } from "./service";
import type { DataSources } from "./sources";
export function intelligenceRuntime(path: string) {
  const authStore = new SqliteAuthStore(path),
    wsStore = new SqliteWorkspaceStore(path),
    crmStore = new SqliteCrmRepository(path),
    metaStore = new SqliteMetaRepository(path),
    store = new SqliteIntelligenceRepository(path);
  const auth = new AuthService(authStore),
    ws = new WorkspaceService(auth, wsStore);
  const source = (w: string): DataSources => {
    const workspace = wsStore.get(w);
    if (!workspace) throw Error("Workspace inexistente");
    const s = crmStore.state(w);
    return {
      name: workspace.name,
      timezone: workspace.timezone,
      initialSince:
        process.env.DINAMIX_CRM_INITIAL_SINCE || "2026-01-01T00:00:00.000Z",
      crm: {
        configured: s.lastSuccessAt !== null,
        bound: true,
        currency: process.env.DINAMIX_CRM_CURRENCY || "BRL",
        state: {
          integrationName: s.integrationName,
          status: s.status,
          lastHealthAt: s.lastHealthAt,
          lastAttemptAt: s.lastAttemptAt,
          lastSuccessAt: s.lastSuccessAt,
          lastError: s.lastError,
          apiVersion: s.apiVersion,
          totalEvents: s.totalEvents,
          lastEvents: s.lastEvents,
          nextAttemptAt: s.nextAttemptAt,
          lastSyncStatus: s.lastSyncStatus,
          hasCursor: s.cursor !== null,
        },
        runs: [],
        leads: crmStore.entities(w, "leads"),
        calls: crmStore.entities(w, "calls"),
        proposals: crmStore.entities(w, "proposals"),
        sales: crmStore.entities(w, "sales"),
      },
      meta: {
        configured: !!metaStore.connection(w),
        configurationMessage: "",
        connection: metaStore.connection(w),
        accounts: metaStore.accounts(w),
        resources: metaStore.resources(w),
        runs: [],
        events: [],
      },
    };
  };
  return {
    service: new IntelligenceService(auth, ws, store, source),
    workspaces: () => wsStore.list().filter((w) => w.active),
    close: () => {
      store.close();
      crmStore.close();
      metaStore.close();
      wsStore.close();
      authStore.close();
    },
  };
}

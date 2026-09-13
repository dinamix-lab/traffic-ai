import "server-only";
import { resolve } from "node:path";
import { auth } from "../auth/server";
import { workspaces } from "../workspaces/server";
import { SqliteCrmRepository } from "../data/crm-sqlite";
import { SqliteWorkspaceStore } from "../data/workspace-sqlite";
import { CrmService } from "./service";
let service: CrmService | undefined;
export function crm() {
  if (!service) {
    const ws = workspaces();
    const path = resolve(
      /* turbopackIgnore: true */ process.env.SQLITE_PATH ||
        "data/traffic-ai.sqlite",
    );
    const store = new SqliteCrmRepository(path);
    service = new CrmService(auth(), ws, store);
    const workspaceStore = new SqliteWorkspaceStore(path);
    service.workerLookup = (slug) =>
      workspaceStore.list().find((w) => w.slug === slug);
  }
  return service;
}

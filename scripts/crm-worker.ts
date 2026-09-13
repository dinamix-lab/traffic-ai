import { resolve } from "node:path";
import { SqliteAuthStore } from "../src/data/auth-sqlite";
import { SqliteWorkspaceStore } from "../src/data/workspace-sqlite";
import { SqliteCrmRepository } from "../src/data/crm-sqlite";
import { AuthService } from "../src/auth/service";
import { WorkspaceService } from "../src/workspaces/service";
import { CrmService } from "../src/crm/service";
import { crmConfig } from "../src/crm/config";
const path = resolve(process.env.SQLITE_PATH || "data/traffic-ai.sqlite"),
  authStore = new SqliteAuthStore(path),
  wsStore = new SqliteWorkspaceStore(path),
  store = new SqliteCrmRepository(path);
const auth = new AuthService(authStore),
  service = new CrmService(auth, new WorkspaceService(auth, wsStore), store);
service.workerLookup = (slug) => wsStore.list().find((w) => w.slug === slug);
let stopped = false,
  timer: ReturnType<typeof setTimeout> | undefined,
  wake: (() => void) | undefined;
const stop = () => {
  stopped = true;
  if (timer) clearTimeout(timer);
  wake?.();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function main() {
  console.log("Worker Dinamix Vendas iniciado; chamadas exclusivamente GET.");
  let last = "";
  try {
    while (!stopped) {
      try {
        const result = await service.tick();
        const message =
          "waiting" in result
            ? "Aguardando chave e workspace CRM ativos."
            : result.busy
              ? "Outro worker possui o lease."
              : `Sincronização ${result.run.status}: ${result.run.events} eventos, ${result.run.pages} páginas.`;
        if (message !== last || !("waiting" in result)) {
          console.log(message);
          last = message;
        }
      } catch {
        console.error(
          "Worker CRM: falha sanitizada; consulte o histórico administrativo.",
        );
      }
      if (stopped) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, crmConfig().pollMs);
      });
    }
  } finally {
    store.close();
    wsStore.close();
    authStore.close();
  }
}
void main().catch(() => {
  console.error("Worker CRM interrompido. Revise a configuração privada.");
  process.exitCode = 1;
});

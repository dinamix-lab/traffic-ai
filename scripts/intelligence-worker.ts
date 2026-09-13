import { resolve } from "node:path";
import { intelligenceRuntime } from "../src/intelligence/runtime";
const runtime = intelligenceRuntime(
  resolve(process.env.SQLITE_PATH || "data/traffic-ai.sqlite"),
);
let timer: ReturnType<typeof setTimeout> | undefined,
  stopped = false;
function stop() {
  stopped = true;
  if (timer) clearTimeout(timer);
  runtime.close();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
function tick() {
  if (stopped) return;
  for (const w of runtime.workspaces()) {
    try {
      runtime.service.tick(w.id);
    } catch {
      console.error(
        "Inteligência: análise local interrompida; dados externos não foram alterados.",
      );
    }
  }
  if (!stopped) timer = setTimeout(tick, 300000);
}
console.log(
  "Intelligence worker iniciado: análise diária local, sem chamadas externas.",
);
tick();

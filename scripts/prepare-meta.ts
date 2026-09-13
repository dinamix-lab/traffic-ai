import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SqliteAuthStore } from "../src/data/auth-sqlite";
import { SqliteWorkspaceStore } from "../src/data/workspace-sqlite";
import { SqliteMetaRepository } from "../src/data/meta-sqlite";
const path = resolve(process.env.SQLITE_PATH || "data/traffic-ai.sqlite");
const authentication = new SqliteAuthStore(path),
  workspaces = new SqliteWorkspaceStore(path),
  meta = new SqliteMetaRepository(path);
try {
  if (!workspaces.list().some((w) => w.slug === "dinamix-eletricos"))
    workspaces.transaction(() =>
      workspaces.save({
        id: randomUUID(),
        name: "Dinamix Elétricos",
        slug: "dinamix-eletricos",
        active: true,
        createdAt: Date.now(),
        description: "Operação preparada para conexão oficial Meta.",
        timezone: "America/Sao_Paulo",
        currency: "BRL",
      }),
    );
  const envPath = resolve(".env.local");
  let text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (!/^TOKEN_ENCRYPTION_KEY=.+$/m.test(text)) {
    text = text.replace(/^TOKEN_ENCRYPTION_KEY=.*\r?\n?/m, "");
    text +=
      "\nTOKEN_ENCRYPTION_KEY=" + randomBytes(32).toString("base64") + "\n";
    writeFileSync(envPath, text, { mode: 0o600 });
  }
  console.log(
    "Estrutura Meta e workspace preparados. Chave local preservada ou gerada sem exibição. Configure o app Meta no ambiente privado.",
  );
} finally {
  meta.close();
  workspaces.close();
  authentication.close();
}

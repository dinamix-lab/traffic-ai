import { resolve } from "node:path";
import { SqliteAuthStore } from "../src/data/auth-sqlite";
import { AuthService } from "../src/auth/service";
async function main() {
  const store = new SqliteAuthStore(
    resolve(process.env.SQLITE_PATH || "data/traffic-ai.sqlite"),
  );
  try {
    if (store.listUsers().length) {
      console.log(
        "Seed não executado: já existem usuários. Nenhuma senha foi alterada.",
      );
      return;
    }
    const created = await new AuthService(store).seedAdmin(
      {
        name: process.env.SEED_ADMIN_NAME,
        email: process.env.SEED_ADMIN_EMAIL,
        role: "admin",
        active: true,
      },
      process.env.SEED_ADMIN_PASSWORD,
    );
    console.log(
      created
        ? "Administrador inicial criado. Use o e-mail e a senha definidos no ambiente para entrar."
        : "Seed não executado: já existem usuários.",
    );
  } finally {
    store.close();
  }
}
main().catch(() => {
  console.error(
    "Seed não concluído. Verifique SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (12–128 caracteres) e o acesso ao banco. Nenhuma credencial é exibida.",
  );
  process.exitCode = 1;
});

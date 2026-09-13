import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolve } from "node:path";
import { SqliteAuthStore } from "@/data/auth-sqlite";
import { AuthService } from "./service";
import { SESSION_COOKIE } from "./config";
let service: AuthService | undefined;
export function auth() {
  return (service ??= new AuthService(
    new SqliteAuthStore(
      resolve(
        /* turbopackIgnore: true */ process.env.SQLITE_PATH ||
          "data/traffic-ai.sqlite",
      ),
    ),
  ));
}
export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
export async function currentUser() {
  const token = await sessionToken();
  return token ? auth().currentUser(token) : null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/acesso-negado");
  return user;
}

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolve } from "node:path";
import { auth, requireUser, sessionToken } from "../auth/server";
import { AuthError } from "../auth/errors";
import { SqliteWorkspaceStore } from "../data/workspace-sqlite";
import { WorkspaceService } from "./service";
export const WORKSPACE_COOKIE = "traffic_ai_workspace";
let instance: WorkspaceService | undefined;
export function workspaces() {
  const authentication = auth();
  return (instance ??= new WorkspaceService(
    authentication,
    new SqliteWorkspaceStore(
      resolve(
        /* turbopackIgnore: true */ process.env.SQLITE_PATH ||
          "data/traffic-ai.sqlite",
      ),
    ),
  ));
}
export type Search = Promise<{ workspace?: string | string[] }>;
export async function workspaceContext(search?: Search) {
  const user = await requireUser();
  const token = await sessionToken();
  const list = workspaces().accessible(token);
  const requested = (await search)?.workspace;
  if (Array.isArray(requested)) redirect("/acesso-negado");
  let workspace;
  if (requested) {
    try {
      workspace = workspaces().requireAccess(token, requested);
    } catch (e) {
      if (e instanceof AuthError) redirect("/acesso-negado");
      throw e;
    }
  } else {
    const saved = (await cookies()).get(WORKSPACE_COOKIE)?.value;
    workspace =
      list.find((w) => w.id === saved) ||
      list.find((w) => w.id === "ws-scale") ||
      list[0] ||
      null;
  }
  return {
    user,
    workspace,
    workspaces: list,
    goals: workspace ? workspaces().goals(token, workspace.id) : null,
  };
}

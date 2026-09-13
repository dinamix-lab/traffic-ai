import { sessionToken } from "@/auth/server";
import { workspaces, WORKSPACE_COOKIE } from "@/workspaces/server";
import { failure, json, jsonBody } from "@/auth/http";
import { cookieOptions } from "@/auth/config";
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const workspace = workspaces().requireAccess(
      await sessionToken(),
      String(body.workspaceId),
    );
    const response = json({ workspace });
    response.cookies.set(WORKSPACE_COOKIE, workspace.id, {
      ...cookieOptions(),
      maxAge: 8 * 3600,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}

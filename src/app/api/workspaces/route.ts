import { sessionToken } from "@/auth/server";
import { workspaces } from "@/workspaces/server";
import { failure, json, jsonBody } from "@/auth/http";
export async function GET() {
  try {
    return json({ workspaces: workspaces().accessible(await sessionToken()) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const token = await sessionToken();
    const body = await jsonBody(request);
    return json({ workspace: workspaces().save(token, body) }, 201);
  } catch (e) {
    return failure(e);
  }
}

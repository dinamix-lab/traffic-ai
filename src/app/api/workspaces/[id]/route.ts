import { sessionToken } from "@/auth/server";
import { workspaces } from "@/workspaces/server";
import { failure, json, jsonBody } from "@/auth/http";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json(workspaces().detail(await sessionToken(), (await params).id));
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json({
      workspace: workspaces().save(
        await sessionToken(),
        await jsonBody(request),
        (await params).id,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}

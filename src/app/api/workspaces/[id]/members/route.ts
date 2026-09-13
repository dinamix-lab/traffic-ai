import { sessionToken } from "@/auth/server";
import { workspaces } from "@/workspaces/server";
import { failure, json, jsonBody } from "@/auth/http";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json({
      members: workspaces().setMembers(
        await sessionToken(),
        (await params).id,
        (await jsonBody(request)).userIds,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}

import { sessionToken } from "@/auth/server";
import { workspaces } from "@/workspaces/server";
import { failure, json, jsonBody } from "@/auth/http";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json({
      goals: workspaces().goals(await sessionToken(), (await params).id),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json({
      goals: workspaces().saveGoals(
        await sessionToken(),
        (await params).id,
        await jsonBody(request),
      ),
    });
  } catch (e) {
    return failure(e);
  }
}

import { sessionToken } from "@/auth/server";
import { failure, json, jsonBody } from "@/auth/http";
import { AuthError } from "@/auth/errors";
import { crm } from "@/crm/server";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json(crm().snapshot(await sessionToken(), (await params).id));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await jsonBody(request);
    if (body.action !== "health" && body.action !== "sync")
      throw new AuthError("Ação CRM inválida.");
    return json(
      await crm().run(await sessionToken(), (await params).id, body.action),
    );
  } catch (e) {
    return failure(e);
  }
}

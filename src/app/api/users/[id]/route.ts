import { auth, sessionToken } from "@/auth/server";
import { failure, json, jsonBody } from "@/auth/http";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = await sessionToken();
    auth().requireAdmin(token);
    const { id } = await params;
    const body = await jsonBody(request);
    return json({ user: auth().updateUser(token, id, body) });
  } catch (error) {
    return failure(error);
  }
}

import { auth, sessionToken } from "@/auth/server";
import { failure, json, jsonBody } from "@/auth/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = await sessionToken();
    auth().requireAdmin(token);
    const { id } = await params;
    const body = await jsonBody(request);
    await auth().resetPassword(token, id, body.password);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

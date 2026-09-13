import { auth, sessionToken } from "@/auth/server";
import { failure, json, jsonBody } from "@/auth/http";
import { AuthError } from "@/auth/errors";
import { meta } from "@/meta/server";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json(meta().snapshot(await sessionToken(), (await params).id));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await jsonBody(request);
    auth().requireAdmin(await sessionToken());
    throw new AuthError(
      "A simulação de conexão foi encerrada. Utilize a conexão oficial Meta.",
      410,
    );
  } catch (e) {
    return failure(e);
  }
}

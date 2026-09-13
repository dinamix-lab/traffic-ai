import { sessionToken } from "@/auth/server";
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
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await jsonBody(request),
      token = await sessionToken(),
      w = (await params).id;
    if (body.action === "connect") {
      const result = meta().begin(token, w);
      const response = json({ url: result.url });
      response.cookies.set("traffic_meta_oauth", result.state, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/api/meta/oauth",
        maxAge: 600,
      });
      return response;
    }
    if (body.action === "select") {
      await meta().select(token, w, body.accountIds);
      return json({ ok: true });
    }
    if (body.action === "sync")
      return json({ run: await meta().sync(token, w) });
    if (body.action === "disconnect") {
      meta().disconnect(token, w);
      return json({ ok: true });
    }
    throw new AuthError("Ação Meta inválida.");
  } catch (e) {
    return failure(e);
  }
}

import "server-only";
import { NextResponse } from "next/server";
import { AuthError } from "./errors";
import { authOrigin } from "./config";
export function assertSameOrigin(request: Request) {
  if (request.headers.get("origin") !== authOrigin())
    throw new AuthError(
      "Origem da solicitação não permitida. Reabra a aplicação no endereço configurado.",
      403,
    );
}
export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AuthError("Envie os dados em formato JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("Dados não informados.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 8192) {
      await reader.cancel();
      throw new AuthError("Solicitação muito grande.", 413);
    }
    chunks.push(value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new AuthError("Dados inválidos. Revise os campos.");
  }
}
export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function failure(error: unknown) {
  if (error instanceof AuthError)
    return json({ error: error.message }, error.status);
  // No request bodies, credentials, database values or tokens are logged.
  console.error("Falha interna de autenticação ou gestão de usuários.");
  return json(
    { error: "Não foi possível concluir a solicitação. Tente novamente." },
    500,
  );
}

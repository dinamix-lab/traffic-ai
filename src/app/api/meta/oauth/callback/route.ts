import { cookies } from "next/headers";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
// Meta arrives cross-site; the application session remains SameSite=Strict.
// A same-origin form submission makes that session available without weakening its cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "",
    code = url.searchParams.get("code") || "";
  const cookie = (await cookies()).get("traffic_meta_oauth")?.value;
  const valid =
    !!cookie &&
    state === cookie &&
    code.length > 0 &&
    code.length <= 4096 &&
    !url.searchParams.has("error");
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Autorização Meta · Traffic AI</title></head><body><main><h1>Traffic AI · Autorização Meta</h1>${valid ? `<p>Conclua o retorno seguro com sua sessão do Traffic AI.</p><form method="post" action="/api/meta/oauth/complete"><input type="hidden" name="state" value="${escape(state)}"><input type="hidden" name="code" value="${escape(code)}"><button type="submit">Continuar no Traffic AI</button></form>` : '<p>Autorização cancelada, expirada ou retorno inválido. Volte ao Traffic AI e inicie novamente.</p><a href="/integracoes">Voltar às integrações</a>'}</main></body></html>`,
    {
      status: valid ? 200 : 400,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}

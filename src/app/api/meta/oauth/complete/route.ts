import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionToken } from "@/auth/server";
import { assertSameOrigin } from "@/auth/http";
import { authOrigin } from "@/auth/config";
import { meta } from "@/meta/server";
export async function POST(request: Request) {
  let destination = "/integracoes?meta=oauth_failed";
  try {
    assertSameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 8192)
      throw new Error();
    if (
      !request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      throw new Error();
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(chunk.value);
    }
    const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    const w = await meta().complete(
      await sessionToken(),
      String(body.get("state") || ""),
      (await cookies()).get("traffic_meta_oauth")?.value,
      String(body.get("code") || ""),
    );
    destination = `/integracoes/meta/contas?workspace=${encodeURIComponent(w)}&meta=authorized`;
  } catch {
    /* Never log codes, provider responses or request URLs. */
  }
  const response = NextResponse.redirect(
    new URL(destination, authOrigin()),
    303,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set("traffic_meta_oauth", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/meta/oauth",
    maxAge: 0,
  });
  return response;
}

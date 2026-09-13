import { sessionToken } from "@/auth/server";
import { json, jsonBody, failure } from "@/auth/http";
import { AuthError } from "@/auth/errors";
import { intelligence } from "@/intelligence/server";
import type { WindowKey } from "@/intelligence/types";
function options(raw: Record<string, unknown>) {
  const mode = raw.mode ?? "real",
    window = raw.window ?? "7";
  if (
    !["real", "demo"].includes(String(mode)) ||
    !["today", "yesterday", "3", "7", "14", "30"].includes(String(window))
  )
    throw new AuthError("Modo ou janela inválida.");
  return { mode: mode as "real" | "demo", window: window as WindowKey };
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { mode, window } = options(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return json(
      intelligence().snapshot(
        await sessionToken(),
        (await params).id,
        mode,
        window,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const b = await jsonBody(request),
      token = await sessionToken(),
      w = (await params).id,
      s = intelligence(),
      { mode, window } = options(b),
      id = typeof b.id === "string" ? b.id : "";
    let result: unknown;
    switch (b.action) {
      case "analyze":
        result = s.generate(token, w, mode, window);
        break;
      case "decide":
        if (b.decision !== "approved" && b.decision !== "rejected")
          throw new AuthError("Decisão inválida.");
        result = s.decide(
          token,
          w,
          id,
          b.decision,
          String(b.reason || ""),
          String(b.note || ""),
        );
        break;
      case "config":
        if (
          !b.values ||
          typeof b.values !== "object" ||
          Array.isArray(b.values)
        )
          throw new AuthError("Configuração inválida.");
        result = s.configure(token, w, b.values as Record<string, unknown>);
        break;
      case "creative":
        if (
          !b.values ||
          typeof b.values !== "object" ||
          Array.isArray(b.values)
        )
          throw new AuthError("Criativo inválido.");
        result = s.saveCreative(
          token,
          w,
          b.values as Record<string, unknown>,
          mode,
        );
        break;
      case "evaluate":
        result = s.evaluateCreative(token, w, id);
        break;
      case "propose":
        if (b.type !== "GROWTH" && b.type !== "CONVERSION")
          throw new AuthError("Tipo inválido.");
        result = s.proposeTest(token, w, id, b.type);
        break;
      case "decideTest":
        if (typeof b.approved !== "boolean")
          throw new AuthError("Decisão inválida.");
        result = s.decideTest(token, w, id, b.approved, String(b.reason || ""));
        break;
      case "mark":
        if (b.kind !== "notification" && b.kind !== "task")
          throw new AuthError("Ação inválida.");
        result = s.mark(token, w, b.kind, id);
        break;
      case "seedDemo":
        result = s.seedDemo(token, w);
        break;
      default:
        throw new AuthError("Ação de inteligência inválida.");
    }
    return json({ ok: true, result });
  } catch (e) {
    return failure(e);
  }
}

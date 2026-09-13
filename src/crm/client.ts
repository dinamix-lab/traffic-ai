import { AuthError } from "../auth/errors";
import { preciseJson } from "./decimal";
import { CRM_BASE } from "./config";
import type { CrmProvider, EventPage } from "./types";
const messages: Record<string, string> = {
  missing_key: "Chave Dinamix Vendas não configurada no servidor.",
  bad_request:
    "CRM recusou a consulta ou o cursor (400). Cursor preservado; revise a configuração.",
  unauthorized: "Configuração inválida: CRM recusou a credencial (401).",
  rate_limit:
    "Limite do CRM atingido. A próxima tentativa respeitará Retry-After.",
  upstream: "CRM temporariamente indisponível.",
  network: "Falha de rede ou timeout ao consultar o CRM.",
  contract: "Resposta do CRM incompatível com o contrato. Cursor preservado.",
  lease:
    "Execução substituída ou lease expirado. Nenhuma página foi confirmada após perder o lock.",
};
export class CrmError extends AuthError {
  constructor(
    public code: string,
    public retryAt = 0,
  ) {
    super(
      messages[code] || "Falha interna de sincronização CRM.",
      code === "missing_key" ? 503 : code === "lease" ? 409 : 502,
    );
  }
}
export function retryAfter(value: string | null, now: number) {
  if (!value) return 0;
  if (/^\d+$/.test(value.trim())) return now + Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(now, date) : 0;
}
export class DinamixClient implements CrmProvider {
  constructor(
    private key: string,
    private options: {
      fetch?: typeof fetch;
      wait?: (ms: number) => Promise<void>;
      now?: () => number;
      jitter?: () => number;
      beforeRequest?: () => Promise<void>;
      defer?: (until: number) => void;
    } = {},
  ) {}
  private async read(
    endpoint: "health" | "events",
    params: Record<string, string> = {},
  ) {
    if (!this.key) throw new CrmError("missing_key");
    const url = new URL(`${CRM_BASE}/${endpoint}`);
    url.search = new URLSearchParams(params).toString();
    const now = this.options.now || Date.now,
      wait =
        this.options.wait || ((ms) => new Promise((r) => setTimeout(r, ms)));
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.options.beforeRequest?.();
      let response: Response;
      try {
        response = await (this.options.fetch || fetch)(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.key}`,
            Accept: "application/json",
          },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        if (attempt === 3) throw new CrmError("network");
        await wait(
          500 * 2 ** attempt +
            Math.floor((this.options.jitter || Math.random)() * 250),
        );
        continue;
      }
      if (response.status === 400) throw new CrmError("bad_request");
      if (response.status === 401) throw new CrmError("unauthorized");
      if (response.status === 429) {
        const until =
          retryAfter(response.headers.get("retry-after"), now()) ||
          now() + 1000 * 2 ** attempt;
        this.options.defer?.(until);
        if (attempt === 3 || until - now() > 60000)
          throw new CrmError("rate_limit", until);
        await wait(Math.max(0, until - now()));
        continue;
      }
      if ([500, 502, 503, 504].includes(response.status)) {
        if (attempt === 3) throw new CrmError("upstream");
        await wait(
          500 * 2 ** attempt +
            Math.floor((this.options.jitter || Math.random)() * 250),
        );
        continue;
      }
      if (!response.ok) throw new CrmError("upstream");
      try {
        const reader = response.body?.getReader();
        if (!reader) throw new Error();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 2_000_000) {
            await reader.cancel();
            throw new Error();
          }
          chunks.push(chunk.value);
        }
        const text = Buffer.concat(chunks).toString("utf8");
        if (text.includes(this.key)) throw new CrmError("contract");
        const data = preciseJson(text);
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new Error();
        return data as Record<string, unknown>;
      } catch (e) {
        if (
          e instanceof Error &&
          ["AbortError", "TimeoutError", "TypeError"].includes(e.name)
        ) {
          if (attempt === 3) throw new CrmError("network");
          await wait(
            500 * 2 ** attempt +
              Math.floor((this.options.jitter || Math.random)() * 250),
          );
          continue;
        }
        throw new CrmError("contract");
      }
    }
    throw new CrmError("upstream");
  }
  async health() {
    const data = await this.read("health");
    if (
      data.status !== "ok" ||
      data.service !== "crm" ||
      typeof data.version !== "string"
    )
      throw new CrmError("contract");
    return {
      status: "ok" as const,
      service: "crm" as const,
      version: data.version,
    };
  }
  async events(
    query:
      { since: string; cursor?: never } | { cursor: string; since?: never },
  ): Promise<EventPage> {
    if ("cursor" in query && "since" in query) throw new CrmError("contract");
    const data = await this.read("events", {
      ...("cursor" in query
        ? { cursor: query.cursor! }
        : { since: query.since! }),
      limit: "100",
    });
    if (
      !Array.isArray(data.events) ||
      data.events.length > 100 ||
      typeof data.has_more !== "boolean" ||
      !(
        data.next_cursor === null ||
        (typeof data.next_cursor === "string" &&
          data.next_cursor.length > 0 &&
          data.next_cursor.length <= 16384)
      ) ||
      (data.has_more && !data.next_cursor) ||
      (data.events.length > 0 && !data.next_cursor)
    )
      throw new CrmError("contract");
    return data as unknown as EventPage;
  }
}

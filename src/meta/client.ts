import { createHmac } from "node:crypto";
import { AuthError } from "../auth/errors";
import type { MetaConfig } from "./security";
import type { MetaProvider, MetaRow } from "./types";
export class MetaApiError extends AuthError {
  constructor(
    public category: string,
    public apiCode: number = 0,
  ) {
    super(
      category === "token_invalid"
        ? "Autorização Meta expirada ou revogada. Reconecte."
        : category === "permission"
          ? "A Meta não disponibilizou este recurso com as permissões atuais."
          : category === "rate_limit"
            ? "Limite da Meta atingido. Tente sincronizar mais tarde."
            : category === "incomplete"
              ? "A resposta excede o limite desta sincronização manual. Nenhum resultado parcial foi publicado."
              : "Não foi possível consultar a Meta. Tente novamente.",
      502,
    );
  }
}
export class GraphClient implements MetaProvider {
  private deadline = Date.now() + 4 * 60 * 1000;
  constructor(
    private config: MetaConfig,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(
    path: string,
    params: Record<string, string>,
    token?: string,
    post = false,
  ): Promise<MetaRow> {
    if (
      !/^(?:me(?:\/[a-z_]+)?|oauth\/access_token|act_\d+(?:\/[a-z_]+)?|\d+(?:\/[a-z_]+)?)$/.test(
        path,
      )
    )
      throw new MetaApiError("invalid_path");
    const url = new URL(
      `https://graph.facebook.com/${this.config.version}/${path}`,
    );
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      params = {
        ...params,
        appsecret_proof: createHmac("sha256", this.config.appSecret)
          .update(token)
          .digest("hex"),
      };
    }
    if (!post) url.search = new URLSearchParams(params).toString();
    else headers["Content-Type"] = "application/x-www-form-urlencoded";
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = this.deadline - Date.now();
      if (remaining <= 0) throw new MetaApiError("incomplete");
      let response: Response;
      try {
        response = await this.transport(url, {
          method: post ? "POST" : "GET",
          headers,
          body: post ? new URLSearchParams(params) : undefined,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(Math.min(25000, remaining)),
        });
      } catch {
        throw new MetaApiError("network");
      }
      let data: MetaRow;
      try {
        data = (await response.json()) as MetaRow;
      } catch {
        throw new MetaApiError("invalid_response");
      }
      if (data.error || !response.ok) {
        const error = (data.error || {}) as MetaRow;
        const code = Number(error.code) || response.status;
        const retry =
          response.status === 429 ||
          response.status >= 500 ||
          [1, 2, 4, 17, 32, 613].includes(code);
        if (retry && attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        throw new MetaApiError(
          code === 190
            ? "token_invalid"
            : [10, 200, 294].includes(code)
              ? "permission"
              : retry
                ? "rate_limit"
                : "api",
          code,
        );
      }
      return data;
    }
    throw new MetaApiError("api");
  }
  get(token: string, path: string, params: Record<string, string> = {}) {
    return this.request(path, params, token);
  }
  async list(token: string, path: string, params: Record<string, string> = {}) {
    const rows: MetaRow[] = [];
    let after = "";
    const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const data = await this.get(token, path, {
        ...params,
        limit: "100",
        ...(after ? { after } : {}),
      });
      if (!Array.isArray(data.data)) throw new MetaApiError("invalid_response");
      rows.push(...(data.data as MetaRow[]));
      const paging = data.paging as
        { next?: string; cursors?: { after?: string } } | undefined;
      if (!paging?.next) return rows;
      after = paging.cursors?.after || "";
      if (!after || seen.has(after)) throw new MetaApiError("incomplete");
      seen.add(after);
    }
    throw new MetaApiError("incomplete");
  }
  async exchange(code: string) {
    const first = await this.request(
      "oauth/access_token",
      {
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        redirect_uri: this.config.redirectUri,
        code,
      },
      undefined,
      true,
    );
    if (typeof first.access_token !== "string")
      throw new MetaApiError("token_invalid");
    const long = await this.request(
      "oauth/access_token",
      {
        grant_type: "fb_exchange_token",
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        fb_exchange_token: first.access_token,
      },
      undefined,
      true,
    );
    if (
      typeof long.access_token !== "string" ||
      !Number.isFinite(Number(long.expires_in)) ||
      Number(long.expires_in) <= 0
    )
      throw new MetaApiError("token_invalid");
    return {
      token: long.access_token,
      expiresAt: Date.now() + Number(long.expires_in) * 1000,
    };
  }
}

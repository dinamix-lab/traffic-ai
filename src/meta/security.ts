import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { AuthError } from "../auth/errors";
export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export class TokenVault {
  private key: Buffer;
  constructor(key: string) {
    this.key = Buffer.from(key, "base64");
    if (this.key.length !== 32)
      throw new AuthError(
        "TOKEN_ENCRYPTION_KEY deve conter 32 bytes em base64.",
        503,
      );
  }
  seal(workspaceId: string, token: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`meta:v1:${workspaceId}`));
    const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return [
      "v1",
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      data.toString("base64"),
    ].join(".");
  }
  open(workspaceId: string, encrypted: string) {
    try {
      const [version, iv, tag, data] = encrypted.split(".");
      if (version !== "v1" || !iv || !tag || !data) throw new Error();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(iv, "base64"),
      );
      decipher.setAAD(Buffer.from(`meta:v1:${workspaceId}`));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(data, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new AuthError(
        "Não foi possível abrir a credencial. Confira a chave de criptografia ou reconecte.",
        503,
      );
    }
  }
}
export interface MetaConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  version: string;
  key: string;
  scopes: string[];
  configId?: string;
}
export function metaConfig(
  env: Record<string, string | undefined> = process.env,
): MetaConfig {
  const {
    META_APP_ID: appId,
    META_APP_SECRET: appSecret,
    META_REDIRECT_URI: redirectUri,
    TOKEN_ENCRYPTION_KEY: key,
  } = env;
  if (!appId || !appSecret || !redirectUri || !key)
    throw new AuthError(
      "Aguardando configuração: preencha as variáveis Meta no ambiente privado do servidor.",
      503,
    );
  const url = new URL(redirectUri);
  const origin = new URL(env.APP_ORIGIN || "http://localhost:3000");
  if (
    url.protocol !== "https:" ||
    url.origin !== origin.origin ||
    url.pathname !== "/api/meta/oauth/callback" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new AuthError(
      "Configure APP_ORIGIN com HTTPS e META_REDIRECT_URI na mesma origem, em /api/meta/oauth/callback.",
      503,
    );
  const version = env.META_API_VERSION || "v26.0";
  if (!/^v\d+\.0$/.test(version) || !/^\d+$/.test(appId))
    throw new AuthError("Revise App ID e versão Meta.", 503);
  new TokenVault(key);
  const allowed = [
    "ads_read",
    "business_management",
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
  ];
  const scopes = (env.META_SCOPES || "ads_read")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!scopes.includes("ads_read") || scopes.some((s) => !allowed.includes(s)))
    throw new AuthError(
      "Use ads_read e somente as permissões opcionais de leitura documentadas.",
      503,
    );
  if (env.META_LOGIN_CONFIG_ID && !/^\d+$/.test(env.META_LOGIN_CONFIG_ID))
    throw new AuthError("Configuration ID Meta inválido.", 503);
  return {
    appId,
    appSecret,
    redirectUri,
    key,
    version,
    scopes,
    configId: env.META_LOGIN_CONFIG_ID,
  };
}

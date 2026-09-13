export const SESSION_COOKIE = "traffic_ai_session";
export function authOrigin() {
  const origin = new URL(process.env.APP_ORIGIN || "http://localhost:3000");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    origin.hostname,
  );
  if (
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && loopback)) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      "APP_ORIGIN deve ser uma origem HTTPS; HTTP é permitido apenas em loopback local.",
    );
  return origin.origin;
}
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: authOrigin().startsWith("https:"),
    sameSite: "strict" as const,
    path: "/",
  };
}

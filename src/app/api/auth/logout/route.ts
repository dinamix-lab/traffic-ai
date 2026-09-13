import { auth, sessionToken } from "@/auth/server";
import { cookieOptions, SESSION_COOKIE } from "@/auth/config";
import { assertSameOrigin, failure, json } from "@/auth/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    auth().logout(await sessionToken());
    const response = json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    return response;
  } catch (error) {
    return failure(error);
  }
}

import { auth } from "@/auth/server";
import { cookieOptions, SESSION_COOKIE } from "@/auth/config";
import { failure, json, jsonBody } from "@/auth/http";
import { SESSION_SECONDS } from "@/auth/service";
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const result = await auth().login(body.email, body.password);
    const response = json({ user: result.user });
    response.cookies.set(SESSION_COOKIE, result.token, {
      ...cookieOptions(),
      maxAge: SESSION_SECONDS,
      expires: new Date(result.expiresAt),
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}

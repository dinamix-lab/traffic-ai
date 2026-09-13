import { auth, sessionToken } from "@/auth/server";
import { failure, json, jsonBody } from "@/auth/http";
export async function GET() {
  try {
    return json({ users: auth().listUsers(await sessionToken()) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const token = await sessionToken();
    auth().requireAdmin(token);
    const body = await jsonBody(request);
    return json(
      { user: await auth().createUser(token, body, body.password) },
      201,
    );
  } catch (error) {
    return failure(error);
  }
}

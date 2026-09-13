import { auth, sessionToken } from "@/auth/server";
import { failure, jsonBody } from "@/auth/http";
import { AuthError } from "@/auth/errors";
export async function PATCH(request: Request) {
  try {
    await jsonBody(request);
    auth().requireAdmin(await sessionToken());
    throw new AuthError(
      "Contas demonstrativas arquivadas. Gerencie a seleção de contas reais na integração Meta.",
      410,
    );
  } catch (e) {
    return failure(e);
  }
}

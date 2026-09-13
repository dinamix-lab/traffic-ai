import { navigateAfterSessionChange } from "./navigation";
export async function apiRequest<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let result: { error?: string };
  try {
    result = await response.json();
  } catch {
    throw new Error("O servidor não respondeu como esperado. Tente novamente.");
  }
  if (!response.ok) {
    if (response.status === 401 && url !== "/api/auth/login")
      navigateAfterSessionChange("/login");
    throw new Error(result.error || "Não foi possível concluir a solicitação.");
  }
  return result as T;
}

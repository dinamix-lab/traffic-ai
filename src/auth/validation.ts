import { AuthError } from "./errors";
import type { UserInput } from "./types";
export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string")
    throw new AuthError("Informe um e-mail válido.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AuthError("Informe um e-mail válido.");
  return email;
}
export function validatePassword(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    value.length > 128 ||
    value.trim().length < 12
  )
    throw new AuthError(
      "A senha deve ter entre 12 e 128 caracteres. Use uma frase longa e exclusiva.",
    );
  return value;
}
export function validateUser(input: unknown): UserInput {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AuthError("Dados de usuário inválidos.");
  const data = input as Record<string, unknown>;
  if (
    typeof data.name !== "string" ||
    data.name.trim().length < 2 ||
    data.name.trim().length > 100
  )
    throw new AuthError("O nome deve ter entre 2 e 100 caracteres.");
  if (data.role !== "admin" && data.role !== "manager")
    throw new AuthError("Selecione um perfil válido.");
  if (typeof data.active !== "boolean")
    throw new AuthError("Informe um status válido.");
  return {
    name: data.name.trim(),
    email: normalizeEmail(data.email),
    role: data.role,
    active: data.active,
  };
}

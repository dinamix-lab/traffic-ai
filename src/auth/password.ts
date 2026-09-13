import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { validatePassword } from "./validation";
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash, extra] = encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    n !== "32768" ||
    r !== "8" ||
    p !== "3" ||
    extra ||
    !salt ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !hash ||
    !/^[a-f0-9]{128}$/.test(hash)
  )
    return false;
  if (password.length > 128) return false;
  return timingSafeEqual(
    await derive(password, salt),
    Buffer.from(hash, "hex"),
  );
}
// Equal-cost check for unknown accounts; this random value is not an account credential.
export async function dummyPasswordCheck(password: string) {
  await derive(password, "00000000000000000000000000000000");
}

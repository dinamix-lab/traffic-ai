// Money never enters IEEE-754 arithmetic. JSON numeric lexemes become strings.
const SCALE = 10n ** 18n;
export function decimal(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("Decimal deve ser transmitido sem perda de precisão.");
    value = String(value);
  }
  if (typeof value !== "string" || !/^\d{1,30}(?:\.\d{1,18})?$/.test(value))
    throw new Error("Decimal inválido.");
  const [whole, fraction = ""] = value.split(".");
  const f = fraction.replace(/0+$/, "");
  return BigInt(whole!).toString() + (f ? "." + f : "");
}
const scaled = (v: string) => {
  const [a, b = ""] = decimal(v).split(".");
  return BigInt(a!) * SCALE + BigInt(b.padEnd(18, "0"));
};
const unscaled = (n: bigint) => {
  const s = n.toString().padStart(19, "0");
  return decimal(s.slice(0, -18) + "." + s.slice(-18));
};
export const add = (a: string, b: string) => unscaled(scaled(a) + scaled(b));
export function divide(a: string, b: string, places = 4): string | null {
  const denominator = scaled(b);
  if (!denominator) return null;
  const multiplier = 10n ** BigInt(places);
  const result = (scaled(a) * multiplier + denominator / 2n) / denominator;
  const s = result.toString().padStart(places + 1, "0");
  return places ? decimal(s.slice(0, -places) + "." + s.slice(-places)) : s;
}
export const percent = (n: number, d: number) =>
  divide(String(n * 100), String(d), 2);
export function preciseJson(text: string): unknown {
  let result = "",
    i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      const start = i++;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i++] === '"') break;
      }
      result += text.slice(start, i);
    } else if (c === "-" || /\d/.test(c)) {
      const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
        text.slice(i),
      );
      if (!token) throw new Error("JSON inválido");
      result += JSON.stringify(token[0]);
      i += token[0].length;
    } else {
      result += c;
      i++;
    }
  }
  return JSON.parse(result);
}

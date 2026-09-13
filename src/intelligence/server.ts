import "server-only";
import { resolve } from "node:path";
import { intelligenceRuntime } from "./runtime";
let runtime: ReturnType<typeof intelligenceRuntime> | undefined;
export function intelligence() {
  return (runtime ??= intelligenceRuntime(
    resolve(
      /* turbopackIgnore: true */ process.env.SQLITE_PATH ||
        "data/traffic-ai.sqlite",
    ),
  )).service;
}

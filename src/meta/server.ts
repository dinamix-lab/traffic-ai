import "server-only";
import { resolve } from "node:path";
import { auth } from "../auth/server";
import { workspaces } from "../workspaces/server";
import { SqliteMetaRepository } from "../data/meta-sqlite";
import { MetaService } from "./service";
import { GraphClient } from "./client";
let instance: MetaService | undefined;
export function meta() {
  const ws = workspaces();
  return (instance ??= new MetaService(
    auth(),
    ws,
    new SqliteMetaRepository(
      resolve(
        /* turbopackIgnore: true */ process.env.SQLITE_PATH ||
          "data/traffic-ai.sqlite",
      ),
    ),
    (c) => new GraphClient(c),
  ));
}

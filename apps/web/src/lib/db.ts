import "server-only";
import pg from "pg";
import { fromPgPool, JobQueue, type Db } from "@mercatta/server";
import { serverEnv } from "./env";

const g = globalThis as { __mixPool?: pg.Pool; __mixQueue?: Promise<JobQueue> };

/** Pool único por instância (no dev o Next recarrega módulos: guardamos no globalThis). */
export function getDb(): Db {
  g.__mixPool ??= new pg.Pool({ connectionString: serverEnv().DATABASE_URL, max: 4 });
  return fromPgPool(g.__mixPool);
}

export function getQueue(): Promise<JobQueue> {
  g.__mixQueue ??= JobQueue.startPublisher(serverEnv().DATABASE_URL).catch((e) => {
    g.__mixQueue = undefined; // tenta de novo na próxima chamada
    throw e;
  });
  return g.__mixQueue;
}

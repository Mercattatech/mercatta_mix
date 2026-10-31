import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");

/** Interface mínima: serve para `pg.Client` (produção) e PGlite (testes). */
export interface MigrationClient {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export function readMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((name) => {
      const sql = readFileSync(path.join(dir, name), "utf8");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

/**
 * Aplica as migrations que ainda não rodaram, em ordem, cada uma numa transação (tudo ou nada).
 *  - Registra nome e checksum em `schema_migrations`.
 *  - Se uma migration JÁ aplicada foi editada depois, recusa continuar: migration aplicada nunca se altera,
 *    mudanças entram numa migration nova.
 *  - Usa um lock do Postgres para que dois processos não migrem ao mesmo tempo.
 * Devolve os nomes aplicados agora.
 */
export async function applyMigrations(client: MigrationClient, files: MigrationFile[] = readMigrations(), log: (m: string) => void = () => undefined): Promise<string[]> {
  await client.exec("select pg_advisory_lock(727001)");
  try {
    await client.exec("create table if not exists public.schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())");
    const done = new Map((await client.query<{ name: string; checksum: string }>("select name, checksum from public.schema_migrations")).rows.map((r) => [r.name, r.checksum]));

    const applied: string[] = [];
    for (const f of files) {
      const known = done.get(f.name);
      if (known) {
        if (known !== f.checksum) throw new Error(`A migration ${f.name} já foi aplicada e depois foi alterada. Não edite migrations aplicadas: crie uma nova.`);
        continue;
      }
      log(`aplicando ${f.name}…`);
      await client.exec("begin");
      try {
        await client.exec(f.sql);
        await client.query("insert into public.schema_migrations (name, checksum) values ($1, $2)", [f.name, f.checksum]);
        await client.exec("commit");
      } catch (e) {
        await client.exec("rollback").catch(() => undefined);
        throw new Error(`Falha na migration ${f.name}: ${(e as Error).message}`);
      }
      applied.push(f.name);
    }
    return applied;
  } finally {
    await client.exec("select pg_advisory_unlock(727001)").catch(() => undefined);
  }
}

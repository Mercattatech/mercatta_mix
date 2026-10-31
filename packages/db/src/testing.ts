import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations");

/** Imita o que o Supabase já traz: schema auth, auth.uid() e os papéis anon/authenticated/service_role. */
const SUPABASE_STUB = `
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant select on auth.users to service_role;
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant all on sequences to service_role;
  alter default privileges in schema public grant all on functions to service_role;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    } catch (e) {
      throw new Error(`Falha na migration ${f}: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Role = "anon" | "authenticated" | "service_role";

/**
 * Executa `fn` como um usuário do Supabase (papel + JWT sub) dentro de uma transação que SEMPRE é desfeita,
 * para que um erro de RLS num teste não contamine o próximo.
 */
export async function asUser<T>(db: PGlite, userId: string | null, fn: (q: Q) => Promise<T>, role: Role = "authenticated"): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    const q: Q = async (sql, params) => (await db.query(sql, params as unknown[] | undefined)).rows as Record<string, unknown>[];
    return await fn(q);
  } finally {
    await db.exec("rollback");
  }
}

export type Q = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Roda a ação e devolve a mensagem de erro (ou null se não falhou). */
export async function errorOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

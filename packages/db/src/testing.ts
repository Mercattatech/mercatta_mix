import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate";

export { MIGRATIONS_DIR };

/** Banco de teste em memória (PGlite) com TODAS as migrations do projeto aplicadas pelo executor real — Postgres puro, sem stubs. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await applyMigrations({ exec: (s) => db.exec(s), query: (s, p) => db.query(s, p as unknown[] | undefined) });
  return db;
}

/**
 * Executa `fn` como um usuário comum (papel `app_user` + `app.user_id`) dentro de uma transação que SEMPRE é desfeita,
 * para que um erro de RLS num teste não contamine o próximo. `userId = null` simula uma sessão sem usuário.
 */
export async function asUser<T>(db: PGlite, userId: string | null, fn: (q: Q) => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec("set local role app_user");
    await db.query("select set_config('app.user_id', $1, true)", [userId ?? ""]);
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

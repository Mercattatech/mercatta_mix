/** Acesso ao Postgres por uma interface mínima: serve para pg.Pool (produção) e PGlite (testes). */

export interface Sql {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

interface PgClientLike extends Sql {
  release(): void;
}
interface PgPoolLike extends Sql {
  connect(): Promise<PgClientLike>;
}

export function fromPgPool(pool: PgPoolLike): Db {
  return {
    query: (text, params) => pool.query(text, params),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn(client);
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

interface PgliteLike extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

export function fromPglite(db: PgliteLike): Db {
  return {
    query: (text, params) => db.query(text, params),
    transaction: (fn) => db.transaction(fn),
  };
}

/**
 * Executa `fn` como um usuário (define `app.user_id`, lido por `current_user_id()`) — permite reutilizar as funções
 * de permissão do banco (can_write_org etc.) a partir do servidor.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.user_id', $1, true)", [userId]);
    return fn(tx);
  });
}

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para fazer isso.") {
    super(message);
  }
}

/** Confere (com as mesmas regras da RLS) se o usuário pode editar a empresa. */
export async function assertCanWrite(db: Db, userId: string, organizationId: string): Promise<void> {
  const ok = await withUser(db, userId, async (tx) => {
    const r = await tx.query<{ ok: boolean }>("select public.can_write_org($1) as ok", [organizationId]);
    return r.rows[0]?.ok === true;
  });
  if (!ok) throw new ForbiddenError();
}

export async function assertCanRead(db: Db, userId: string, organizationId: string): Promise<void> {
  const ok = await withUser(db, userId, async (tx) => {
    const r = await tx.query<{ ok: boolean }>("select public.can_read_org($1) as ok", [organizationId]);
    return r.rows[0]?.ok === true;
  });
  if (!ok) throw new ForbiddenError();
}

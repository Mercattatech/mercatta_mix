import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, readMigrations, type MigrationClient, type MigrationFile } from "./migrate";

let db: PGlite | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

function client(d: PGlite): MigrationClient {
  return { exec: (s) => d.exec(s), query: (s, p) => d.query(s, p as unknown[] | undefined) as never };
}

const file = (name: string, sql: string): MigrationFile => ({ name, sql, checksum: `sum-${sql}` });

describe("executor de migrations", () => {
  it("aplica todas as migrations do projeto num banco vazio, em ordem", async () => {
    db = new PGlite();
    const applied = await applyMigrations(client(db));
    expect(applied).toEqual(readMigrations().map((m) => m.name));
    expect(applied[0]).toBe("0001_core.sql");
    const tables = (await db.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('users', 'sessions', 'login_tokens', 'jobs', 'renders')")).rows[0]!.n;
    expect(tables).toBe(5);
  });

  it("é idempotente: rodar de novo não aplica nada", async () => {
    db = new PGlite();
    await applyMigrations(client(db));
    expect(await applyMigrations(client(db))).toEqual([]);
  });

  it("recusa continuar se uma migration já aplicada foi editada", async () => {
    db = new PGlite();
    await applyMigrations(client(db), [file("0001_a.sql", "create table t1 (id int);")]);
    await expect(applyMigrations(client(db), [file("0001_a.sql", "create table t1 (id int, extra int);")])).rejects.toThrow(/já foi aplicada e depois foi alterada/);
  });

  it("migration com erro desfaz tudo dela e não fica registrada (e as seguintes não rodam)", async () => {
    db = new PGlite();
    const files = [file("0001_ok.sql", "create table ok (id int);"), file("0002_ruim.sql", "create table meio (id int); select 1/0;"), file("0003_depois.sql", "create table depois (id int);")];
    await expect(applyMigrations(client(db), files)).rejects.toThrow(/Falha na migration 0002_ruim.sql/);
    const names = (await db.query<{ name: string }>("select name from public.schema_migrations")).rows.map((r) => r.name);
    expect(names).toEqual(["0001_ok.sql"]);
    const exists = async (t: string) => (await db!.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_name = '${t}'`)).rows[0]!.n;
    expect(await exists("meio")).toBe(0);
    expect(await exists("depois")).toBe(0);
    expect(await exists("ok")).toBe(1);
  });

  it("aplica só as novas quando já existe histórico", async () => {
    db = new PGlite();
    await applyMigrations(client(db), [file("0001_a.sql", "create table a (id int);")]);
    const applied = await applyMigrations(client(db), [file("0001_a.sql", "create table a (id int);"), file("0002_b.sql", "create table b (id int);")]);
    expect(applied).toEqual(["0002_b.sql"]);
  });
});

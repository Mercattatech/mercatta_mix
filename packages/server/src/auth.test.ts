import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@mercatta/db/testing";
import { consumeLoginLink, createSession, deleteSession, ensureUser, findSession, hashToken, issueLoginLink, normalizeEmail } from "./auth";
import { fromPglite, type Db } from "./sql";

let pg: PGlite;
let db: Db;

beforeAll(async () => {
  pg = await createTestDb();
  db = fromPglite(pg as never);
  await ensureUser(db, "Maria@Empresa.com", "Maria");
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("normalizeEmail / ensureUser", () => {
  it("normaliza e recusa e-mail inválido com mensagem em português", () => {
    expect(normalizeEmail("  Ana@Teste.COM ")).toBe("ana@teste.com");
    expect(() => normalizeEmail("sem-arroba")).toThrow(/e-mail válido/);
    expect(() => normalizeEmail("a@b")).toThrow(/e-mail válido/);
  });

  it("não duplica: o mesmo e-mail (com outra caixa) devolve o mesmo usuário", async () => {
    const a = await ensureUser(db, "maria@empresa.com");
    const b = await ensureUser(db, "MARIA@EMPRESA.COM");
    expect(a.created).toBe(false);
    expect(b.id).toBe(a.id);
  });
});

describe("link de acesso", () => {
  it("e-mail desconhecido NÃO cria conta e devolve null (mesma resposta de quem existe)", async () => {
    const r = await issueLoginLink(db, { email: "intruso@fora.com", ip: "1.1.1.1" });
    expect(r).toBeNull();
    const n = (await pg.query<{ n: number }>("select count(*)::int as n from users where email = 'intruso@fora.com'")).rows[0]!.n;
    expect(n).toBe(0);
  });

  it("guarda só o hash do token, nunca o token", async () => {
    const link = (await issueLoginLink(db, { email: "maria@empresa.com", ip: "2.2.2.2" }))!;
    const rows = (await pg.query<{ token_hash: string }>("select token_hash from login_tokens where user_id = $1", [link.userId])).rows;
    expect(rows.map((r) => r.token_hash)).toContain(hashToken(link.token));
    expect(rows.map((r) => r.token_hash)).not.toContain(link.token);
  });

  it("uso único: a segunda tentativa com o mesmo link falha", async () => {
    const link = (await issueLoginLink(db, { email: "maria@empresa.com", ip: "3.3.3.3" }))!;
    expect(await consumeLoginLink(db, link.token)).toBe(link.userId);
    expect(await consumeLoginLink(db, link.token)).toBeNull();
  });

  it("link vencido não entra", async () => {
    const link = (await issueLoginLink(db, { email: "maria@empresa.com", ip: "4.4.4.4" }))!;
    await pg.query("update login_tokens set expires_at = now() - interval '1 minute' where token_hash = $1", [hashToken(link.token)]);
    expect(await consumeLoginLink(db, link.token)).toBeNull();
  });

  it("token inventado ou vazio não entra", async () => {
    expect(await consumeLoginLink(db, "inventado")).toBeNull();
    expect(await consumeLoginLink(db, "")).toBeNull();
    expect(await consumeLoginLink(db, "x".repeat(500))).toBeNull();
  });

  it("convite vale 72 h; login comum vale 15 min", async () => {
    await ensureUser(db, "novo@empresa.com");
    const invite = (await issueLoginLink(db, { email: "novo@empresa.com", ip: "5.5.5.5", purpose: "invite" }))!;
    const login = (await issueLoginLink(db, { email: "novo@empresa.com", ip: "5.5.5.5" }))!;
    expect(invite.expiresAt.getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
    expect(login.expiresAt.getTime() - Date.now()).toBeLessThan(16 * 60_000);
  });

  it("no máximo 5 links por hora por pessoa (depois devolve null, sem avisar quem pede)", async () => {
    await ensureUser(db, "limite@empresa.com");
    for (let i = 0; i < 5; i++) expect(await issueLoginLink(db, { email: "limite@empresa.com", ip: "6.6.6.6" })).not.toBeNull();
    expect(await issueLoginLink(db, { email: "limite@empresa.com", ip: "6.6.6.6" })).toBeNull();
  });

  it("freio por IP: abusar com e-mails quaisquer é barrado com mensagem em português", async () => {
    for (let i = 0; i < 20; i++) await issueLoginLink(db, { email: `x${i}@fora.com`, ip: "9.9.9.9" });
    await expect(issueLoginLink(db, { email: "x99@fora.com", ip: "9.9.9.9" })).rejects.toThrow(/Muitas tentativas/);
    // outro IP segue normal
    await expect(issueLoginLink(db, { email: "x99@fora.com", ip: "8.8.8.8" })).resolves.toBeNull();
  });
});

describe("sessão", () => {
  it("cria, reconhece e encerra", async () => {
    const userId = (await ensureUser(db, "maria@empresa.com")).id;
    const s = await createSession(db, userId, "Mozilla/5.0");
    const found = await findSession(db, s.token);
    expect(found).toMatchObject({ id: userId, email: "maria@empresa.com", name: "Maria" });

    await deleteSession(db, s.token);
    expect(await findSession(db, s.token)).toBeNull();
  });

  it("guarda só o hash do cookie", async () => {
    const userId = (await ensureUser(db, "maria@empresa.com")).id;
    const s = await createSession(db, userId);
    const hashes = (await pg.query<{ token_hash: string }>("select token_hash from sessions where user_id = $1", [userId])).rows.map((r) => r.token_hash);
    expect(hashes).toContain(hashToken(s.token));
    expect(hashes).not.toContain(s.token);
  });

  it("sessão vencida e cookie inventado não valem", async () => {
    const userId = (await ensureUser(db, "maria@empresa.com")).id;
    const s = await createSession(db, userId);
    await pg.query("update sessions set expires_at = now() - interval '1 second' where token_hash = $1", [hashToken(s.token)]);
    expect(await findSession(db, s.token)).toBeNull();
    expect(await findSession(db, "cookie-falso")).toBeNull();
    expect(await findSession(db, "")).toBeNull();
  });

  it("renova last_seen_at só quando passou de 10 min (evita escrita a cada clique)", async () => {
    const userId = (await ensureUser(db, "maria@empresa.com")).id;
    const s = await createSession(db, userId);
    const seen = async () => (await pg.query<{ t: string }>("select last_seen_at::text as t from sessions where token_hash = $1", [hashToken(s.token)])).rows[0]!.t;
    const first = await seen();
    await findSession(db, s.token);
    expect(await seen()).toBe(first); // recente: não escreve

    await pg.query("update sessions set last_seen_at = now() - interval '1 hour' where token_hash = $1", [hashToken(s.token)]);
    const old = await seen();
    await findSession(db, s.token);
    expect(await seen()).not.toBe(old);
  });

  it("apagar o usuário apaga as sessões e links dele (LGPD)", async () => {
    const { id } = await ensureUser(db, "apagar@empresa.com");
    await createSession(db, id);
    await issueLoginLink(db, { email: "apagar@empresa.com", ip: "7.7.7.7" });
    await pg.query("delete from users where id = $1", [id]);
    const left = (await pg.query<{ n: number }>("select (select count(*) from sessions where user_id = $1)::int + (select count(*) from login_tokens where user_id = $1)::int as n", [id])).rows[0]!.n;
    expect(left).toBe(0);
  });
});

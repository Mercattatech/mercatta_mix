import { randomBytes } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@mercatta/db/testing";
import { decryptSecret, deleteMailSettings, encryptSecret, getMailSettings, loadSmtpConfig, parseEncryptionKey, recordMailTest, saveMailSettings, type MailSettingsInput } from "./mail-settings";
import { fromPglite, type Db } from "./sql";

let pg: PGlite;
let db: Db;
const key = randomBytes(32);

const base: MailSettingsInput = {
  provider: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  security: "starttls",
  username: "grupo@exemplo.com",
  password: "senha-de-app-1234",
  fromName: "Mercatta Mix",
  fromEmail: "grupo@exemplo.com",
  replyTo: null,
  enabled: true,
};

beforeAll(async () => {
  pg = await createTestDb();
  db = fromPglite(pg as never);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("criptografia da senha", () => {
  it("cifra e decifra, e cada cifragem é diferente (IV aleatório)", () => {
    const a = encryptSecret("segredo", key);
    const b = encryptSecret("segredo", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("segredo");
    expect(decryptSecret(a, key)).toBe("segredo");
  });

  it("preserva acentos e símbolos", () => {
    const s = "Senha@2022!ção ✓";
    expect(decryptSecret(encryptSecret(s, key), key)).toBe(s);
  });

  it("detecta adulteração e chave errada, com mensagem em português", () => {
    const blob = encryptSecret("segredo", key);
    const parts = blob.split(":");
    parts[3] = Buffer.from("outro-conteudo").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow(/não foi possível abrir/i);
    expect(() => decryptSecret(blob, randomBytes(32))).toThrow(/não foi possível abrir/i);
    expect(() => decryptSecret("lixo", key)).toThrow(/formato desconhecido/i);
  });

  it("aceita a chave em base64 ou hex e recusa tamanho errado ou ausente", () => {
    const k = randomBytes(32);
    expect(parseEncryptionKey(k.toString("base64")).equals(k)).toBe(true);
    expect(parseEncryptionKey(k.toString("hex")).equals(k)).toBe(true);
    expect(() => parseEncryptionKey("curta")).toThrow(/inválida/);
    expect(() => parseEncryptionKey(undefined)).toThrow(/SETTINGS_ENCRYPTION_KEY/);
  });
});

describe("configurações de SMTP", () => {
  it("sem nada cadastrado: não há configuração", async () => {
    expect(await getMailSettings(db)).toBeNull();
    expect(await loadSmtpConfig(db, key)).toBeNull();
  });

  it("salva; a tela nunca recebe a senha; o banco só guarda a senha cifrada", async () => {
    const view = await saveMailSettings(db, base, key, null);
    expect(view.hasPassword).toBe(true);
    expect(JSON.stringify(view)).not.toContain("senha-de-app-1234");
    const raw = (await pg.query<{ password_enc: string }>("select password_enc from mail_settings")).rows[0]!.password_enc;
    expect(raw).not.toContain("senha-de-app-1234");
    const cfg = await loadSmtpConfig(db, key);
    expect(cfg).toMatchObject({ host: "smtp.gmail.com", port: 587, security: "starttls", username: "grupo@exemplo.com", password: "senha-de-app-1234" });
  });

  it("atualizar com senha em branco mantém a senha antiga; só uma linha existe", async () => {
    await saveMailSettings(db, { ...base, password: "", host: "smtp.outro.com", port: 465, security: "ssl" }, key, null);
    const cfg = await loadSmtpConfig(db, key);
    expect(cfg).toMatchObject({ host: "smtp.outro.com", port: 465, security: "ssl", password: "senha-de-app-1234" });
    expect((await pg.query<{ n: number }>("select count(*)::int as n from mail_settings")).rows[0]!.n).toBe(1);
  });

  it("trocar a senha substitui; desligado = não envia por ele", async () => {
    await saveMailSettings(db, { ...base, password: "nova-senha" }, key, null);
    expect((await loadSmtpConfig(db, key))!.password).toBe("nova-senha");
    await saveMailSettings(db, { ...base, password: "", enabled: false }, key, null);
    expect(await loadSmtpConfig(db, key)).toBeNull();
    expect((await loadSmtpConfig(db, key, { includeDisabled: true }))!.password).toBe("nova-senha");
    expect((await getMailSettings(db))!.enabled).toBe(false);
  });

  it("guarda o resultado do teste e o zera quando a configuração muda", async () => {
    await recordMailTest(db, false, "x".repeat(1000));
    let v = (await getMailSettings(db))!;
    expect(v.lastTestOk).toBe(false);
    expect(v.lastTestError!.length).toBe(300);
    await recordMailTest(db, true);
    v = (await getMailSettings(db))!;
    expect(v).toMatchObject({ lastTestOk: true, lastTestError: null });
    await saveMailSettings(db, base, key, null);
    expect((await getMailSettings(db))!.lastTestOk).toBeNull();
  });

  it("valida os campos com mensagens em português", async () => {
    await expect(saveMailSettings(db, { ...base, host: "https://smtp.gmail.com" }, key, null)).rejects.toThrow(/Servidor SMTP inválido/);
    await expect(saveMailSettings(db, { ...base, host: "smtp.gmail.com:587" }, key, null)).rejects.toThrow(/Servidor SMTP inválido/);
    await expect(saveMailSettings(db, { ...base, port: 0 }, key, null)).rejects.toThrow(/Porta/);
    await expect(saveMailSettings(db, { ...base, fromEmail: "sem-arroba" }, key, null)).rejects.toThrow(/E-mail de envio/);
    await expect(saveMailSettings(db, { ...base, security: "nenhuma" as never }, key, null)).rejects.toThrow(/segurança/);
  });

  it("recusa injeção de cabeçalho no nome e no e-mail de envio", async () => {
    await expect(saveMailSettings(db, { ...base, fromName: "Mix\r\nBcc: alguem@x.com" }, key, null)).rejects.toThrow(/quebra de linha/);
    await expect(saveMailSettings(db, { ...base, fromEmail: "a@b.com\nBcc: x@y.com" }, key, null)).rejects.toThrow(/quebra de linha/);
    await expect(saveMailSettings(db, { ...base, replyTo: "a@b.com\r\nX: 1" }, key, null)).rejects.toThrow(/quebra de linha/);
  });

  it("primeira vez sem senha é recusada; apagar remove tudo", async () => {
    await deleteMailSettings(db);
    await expect(saveMailSettings(db, { ...base, password: "" }, key, null)).rejects.toThrow(/senha do SMTP/);
    expect(await getMailSettings(db)).toBeNull();
  });
});

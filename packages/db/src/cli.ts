import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyMigrations } from "./migrate";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// aceita um .env na raiz do repositório só com DATABASE_URL (sem sobrescrever o que já está no ambiente)
const rootEnv = path.join(ROOT, ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const USAGE = `Uso:
  npm run db:migrate                      aplica as migrations pendentes
  npm run db:make-admin -- email@x.com    cria (se preciso) o usuário e o torna admin da plataforma
                                          e imprime um link de acesso de uso único (vale 30 min; precisa de APP_URL)

Precisa de DATABASE_URL (ambiente ou .env na raiz do repositório).`;

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!cmd || !["migrate", "make-admin"].includes(cmd)) {
    console.log(USAGE);
    process.exit(cmd ? 1 : 0);
  }
  if (!url) {
    console.error("DATABASE_URL não está definida.\n\n" + USAGE);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (cmd === "migrate") {
      const applied = await applyMigrations({ exec: (s) => client.query(s), query: (s, p) => client.query(s, p) as never }, undefined, (m) => console.log(m));
      console.log(applied.length ? `Pronto: ${applied.length} migration(s) aplicada(s).` : "Nada a aplicar: o banco já está atualizado.");
    } else {
      const email = (arg ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        console.error("Informe um e-mail válido: npm run db:make-admin -- email@x.com");
        process.exit(1);
      }
      const user = await client.query<{ id: string }>(
        "insert into users (email) values ($1) on conflict (email) do update set email = excluded.email returning id",
        [email],
      );
      await client.query("insert into platform_admins (user_id) values ($1) on conflict do nothing", [user.rows[0]!.id]);
      console.log(`${email} agora é admin da plataforma.`);
      // Primeiro acesso sem depender de e-mail (o SMTP só se cadastra depois de entrar). Mesmo formato do login normal:
      // no banco vai só o hash do token; o link é de uso único.
      const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, "");
      if (appUrl) {
        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
        await client.query("insert into login_tokens (user_id, token_hash, purpose, expires_at) values ($1, $2, 'login', $3)", [
          user.rows[0]!.id,
          createHash("sha256").update(token).digest("hex"),
          expiresAt,
        ]);
        console.log(`\nLink de acesso (uso único, vale 30 minutos):\n${appUrl}/auth/verify?token=${encodeURIComponent(token)}`);
      } else {
        console.log("Defina APP_URL para o comando também imprimir um link de acesso; ou peça o link na tela de login (precisa de e-mail configurado).");
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});

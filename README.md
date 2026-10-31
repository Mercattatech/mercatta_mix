# Mercatta Mix

SaaS do Grupo Mercatta: pega vídeos brutos e entrega Reels/Shorts cortados, combinados, legendados, com texto SEO, publicados e medidos.
Diferencial: o **Combinador** — 3 ganchos × 2 miolos × 2 chamadas = 12 vídeos, cada um pronto para postar.

> **Status: Fase 1 aprovada** (upload → transcrição → editor de trechos → combinações → render com legenda → ZIP).
> Banco: **Postgres puro** (sem Supabase). Login: **link mágico por e-mail**, só por convite.
> Arquitetura e decisões: `fase0_arquitetura.md` (aprovada).

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/web` | Site (Next.js 16, React 19, Tailwind v4) + rotas de API. Vai para a Vercel (ou qualquer host Node). |
| `apps/worker` | Processa a fila: pré-processa, transcreve (faster-whisper), renderiza (FFmpeg + libass), monta ZIP. Docker (Fly.io). |
| `packages/core` | Regras puras e testadas: combinações, cortes no limite da palavra, linha do tempo em quadros, legenda ASS, comandos FFmpeg. |
| `packages/db` | Executor de migrations (`db:migrate`), script do primeiro admin e testes do banco (RLS, créditos, LGPD) com PGlite. |
| `packages/server` | Casos de uso compartilhados por site e worker: login/sessões, uploads, combinações, renders, fila pg-boss. |
| `db/migrations` | `0001_core.sql`, `0002_editing.sql`, `0003_auth.sql` — aplicadas em ordem pelo `npm run db:migrate`. |

## Como rodar (desenvolvimento)

Requisitos: Node ≥ 22.12, FFmpeg no PATH e um Postgres 15+ (16 recomendado). Não precisa de Cloudflare R2 (o armazenamento local cobre o desenvolvimento).

1. **Instale:** `npm install`
2. **Postgres** — escolha um:
   - Docker: `docker compose up -d` (sobe em `postgres://mix:mix@localhost:5432/mix`).
   - Homebrew: `brew install postgresql@16 && brew services start postgresql@16 && createdb mix` (URL: `postgres://localhost:5432/mix`).
3. **Variáveis:** crie um `.env` **na raiz** só com `DATABASE_URL=...` (usado pelos comandos de banco). Depois copie `.env.example` para `apps/web/.env.local` e para `apps/worker/.env` e preencha.
   Em dev: `STORAGE_DRIVER=local` com o **mesmo caminho absoluto** de `LOCAL_STORAGE_DIR` nos dois, e `MAIL_DRIVER=console`.
   `DATABASE_URL` deve ser a conexão **direta** (porta 5432), nunca pooler em modo transaction.
4. **Banco:** `npm run db:migrate` (aplica as migrations pendentes; pode rodar quantas vezes quiser).
5. **Primeiro admin:** `npm run db:make-admin -- seu@email.com`
6. **Rode** (dois terminais):
   ```bash
   npm run start -w @mercatta/worker
   npm run dev -w @mercatta/web
   ```
7. Abra `http://localhost:3000`, digite o e-mail do admin: com `MAIL_DRIVER=console` o **link de acesso aparece no terminal do site**. Clique em "Entrar".
8. Em **Admin**: crie uma empresa com créditos e convide as pessoas (o convite sai por e-mail e vale 72 h). Depois crie um projeto.

> Transcrição local: o worker usa Python com `faster-whisper` (veja o `Dockerfile`). Sem ele, use `TRANSCRIBER=openai` + `OPENAI_API_KEY`.

## Como funciona o login

- **Só por convite:** o admin cria o usuário; ninguém se cadastra sozinho. E-mail desconhecido recebe a mesma resposta de quem existe (não revela quem é cliente).
- **Link mágico:** token aleatório de 256 bits, só o hash vai para o banco; vale 15 min (convite: 72 h) e só funciona uma vez.
- **Anti-scanner:** o link do e-mail abre uma página com um botão "Entrar"; só o clique gasta o link (antivírus e leitores de e-mail abrem links sozinhos).
- **Sessão:** cookie `httpOnly`, `SameSite=Lax`, `Secure` quando `APP_URL` é https, validade de 30 dias; o banco guarda só o hash.
- **Freios:** 5 links por hora por pessoa e 20 pedidos por 15 min por IP.
- **Permissões:** o código do site/API confere o papel (`owner`, `editor`, `aprovador`) usando as funções do banco (`can_read_org` etc.). As políticas de RLS continuam no banco como segunda barreira para o papel `app_user`, mas **o site conecta como dono do banco**, então hoje a barreira principal é o código (coberto por testes).

## Como testar

```bash
npm test            # tudo (o teste de aceite leva ~70 s)
npm run typecheck
npm run lint
```

- `packages/core`: 96 testes (combinações, cortes, linha do tempo, ASS, comandos FFmpeg).
- `packages/db`: RLS por empresa, créditos, LGPD e o executor de migrations (idempotência, checksum, rollback).
- `packages/server`: login por link e sessões (uso único, expiração, freios, só-hash), uploads, renders idempotentes.
- `apps/worker`: **teste de aceite da Fase 1**: 3 ganchos + 2 miolos + 2 chamadas → 12 MP4 1080×1920 ≤ 60 s, sem estalo nas emendas (com controle negativo), erro de sincronia da legenda abaixo de 150 ms (medido: 3,3 ms com palavras sintéticas), créditos, reexecução idempotente, ZIP com 12 arquivos `H1_M1_C1.mp4`…
- Os testes de banco usam PGlite (Postgres em WebAssembly). O CI também aplica as migrations num **Postgres 16 de verdade** (job `postgres-migrations`).
- A legenda queimada (libass) só é testada onde o FFmpeg tem libass: no Docker/CI (`FORCE_ASS_TEST=1`).

## Como publicar (produção)

1. **Postgres:** qualquer Postgres 15+ (próprio, Neon, RDS, Railway…). Defina `DATABASE_URL` (conexão direta) no site e no worker e rode `npm run db:migrate` a cada deploy que traga migration nova. Faça backup diário.
2. **E-mail:** crie uma conta SMTP (Resend, Brevo, SES…), verifique o domínio e defina `MAIL_DRIVER=smtp`, `SMTP_URL` e `MAIL_FROM`. Com `MAIL_DRIVER=console` o site recusa subir em produção.
3. **Cloudflare R2:** crie o bucket e uma chave de API. CORS do bucket:
   ```json
   [{ "AllowedOrigins": ["https://SEU-DOMINIO"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
   O `ExposeHeaders: ETag` é obrigatório: sem ele o envio em partes não fecha.
4. **Site:** defina `APP_URL` (https, sem barra no fim) e as demais variáveis do `.env.example` (`STORAGE_DRIVER=r2`). Na Vercel: *Root Directory* `apps/web`.
5. **Worker (Fly.io):** `fly launch --no-deploy --copy-config --config apps/worker/fly.toml`, `fly secrets set ...` com as variáveis do worker, `fly deploy --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile .`
6. **Primeiro admin:** `DATABASE_URL=... npm run db:make-admin -- seu@email.com`.
7. **CI:** `.github/workflows/ci.yml` roda typecheck, testes (com libass), migrations em Postgres real e o build do Docker.

## LGPD e segurança (resumo)

- Cada empresa só acessa os próprios dados; apagar a empresa ou o usuário apaga tudo em cascata (testado), inclusive sessões e links.
- Papéis: `owner`, `editor`, `aprovador` (só lê e baixa). Máximo de 3 pessoas por empresa.
- Nenhuma chave no código: tudo via variáveis de ambiente (`.env*` está no `.gitignore`).
- Migration já aplicada nunca é editada (o executor confere o checksum); mudanças entram numa migration nova.

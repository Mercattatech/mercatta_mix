# Mercatta Mix

SaaS do Grupo Mercatta: pega vídeos brutos e entrega Reels/Shorts cortados, combinados, legendados, com texto SEO, publicados e medidos.
Diferencial: o **Combinador** — 3 ganchos × 2 miolos × 2 chamadas = 12 vídeos, cada um pronto para postar.

> **Status: Fase 1 aprovada** (upload → transcrição → editor de trechos → combinações → render com legenda → ZIP).
> Banco: **Postgres puro** (sem Supabase). Login: **link mágico por e-mail**, só por convite.
> Arquitetura e decisões: `fase0_arquitetura.md` (aprovada).

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/web` | Site (Next.js 16, React 19, Tailwind v4) + rotas de API. Imagem Docker em `apps/web/Dockerfile`. |
| `apps/worker` | Processa a fila: pré-processa, transcreve (faster-whisper large-v3-turbo + alinhamento wav2vec2), renderiza (FFmpeg + libass), monta ZIP. Imagem Docker em `apps/worker/Dockerfile`. |
| `packages/core` | Regras puras e testadas: combinações, cortes no limite da palavra, linha do tempo em quadros, legenda ASS, comandos FFmpeg. |
| `packages/db` | Executor de migrations (`db:migrate`), script do primeiro admin e testes do banco (RLS, créditos, LGPD) com PGlite. |
| `packages/server` | Casos de uso compartilhados por site e worker: login/sessões, uploads, combinações, renders, fila pg-boss. |
| `db/migrations` | `0001_core.sql` … `0004_mail_settings.sql` — aplicadas em ordem pelo `npm run db:migrate`. |

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
5. **Primeiro admin:** `npm run db:make-admin -- seu@email.com` (com `APP_URL` no `.env`, o comando também imprime um **link de acesso de uso único**, válido por 30 min — serve para entrar sem e-mail configurado).
6. **Rode** (dois terminais):
   ```bash
   npm run start -w @mercatta/worker
   npm run dev -w @mercatta/web
   ```
7. Abra `http://localhost:3000`, digite o e-mail do admin: com `MAIL_DRIVER=console` o **link de acesso aparece no terminal do site**. Clique em "Entrar".
8. Em **Admin**: crie uma empresa com créditos e convide as pessoas (o convite sai por e-mail e vale 72 h). Depois crie um projeto.

> Transcrição local: o worker usa Python com `faster-whisper` + `whisperx` (veja `apps/worker/python/requirements.txt` e `apps/worker/python/bench/RESULTADOS.md`). Crie o ambiente com `python3.11 -m venv apps/worker/python/.venv && apps/worker/python/.venv/bin/pip install -r apps/worker/python/requirements.txt` e aponte `PYTHON_BIN` para ele. Sem isso, use `TRANSCRIBER=openai` + `OPENAI_API_KEY`.

## E-mail (SMTP universal)

O dono cadastra o SMTP em **Admin → E-mail** (Gmail, Hostinger, Resend, Brevo, SendGrid, Mailgun, SES, Microsoft, Zoho ou qualquer outro). A senha fica **cifrada (AES-256-GCM)** no banco com a chave `SETTINGS_ENCRYPTION_KEY` e nunca volta para a tela; há botão de teste.

- **Gmail:** não aceita a senha normal da conta. Ative a verificação em duas etapas e crie uma **senha de app** em <https://myaccount.google.com/apppasswords>; use `smtp.gmail.com`, porta 465 (SSL) ou 587 (STARTTLS).
- Gere a chave com `openssl rand -base64 32` e guarde-a: se mudar, a senha do SMTP precisa ser cadastrada de novo.

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

## Deploy na VPS com Coolify

O arquivo [`docker-compose.coolify.yml`](docker-compose.coolify.yml) sobe tudo numa VPS só: **Postgres 16**, **site**, **worker** e volumes (banco e arquivos). Armazenamento em disco (`STORAGE_DRIVER=local`): não precisa de Cloudflare R2.

> Atenção: as imagens só foram construídas no CI (o Mac de desenvolvimento não tem Docker). O site em modo `standalone` foi testado localmente contra um Postgres real; o build do Docker e o compose ainda precisam de um primeiro deploy para serem confirmados.

1. **Requisitos da VPS:** 4 vCPU e **8 GB de RAM** recomendados (o `large-v3-turbo` + alinhador usam ~3 GB durante a transcrição, além do FFmpeg); disco para os vídeos e a imagem do worker (~6 GB).
2. **DNS:** aponte um (sub)domínio, ex. `mix.grupomercatta.com.br`, para o IP da VPS (registro A).
3. **Coolify:** *Projects → New Resource → Docker Compose* (repositório `https://github.com/Mercattatech/mercatta_mix.git`, branch `main`). Em *Docker Compose Location* informe `/docker-compose.coolify.yml`.
4. **Domínio:** no serviço `web`, coloque `https://mix.seudominio.com.br`. O Coolify cuida do certificado (Traefik).
5. **Variáveis** (aba *Environment Variables*): `SETTINGS_ENCRYPTION_KEY` (obrigatória; `openssl rand -base64 32`). Usuário e senha do Postgres o Coolify gera sozinho.
6. **Deploy.** O worker aplica as migrations sozinho ao iniciar (protegido por lock no Postgres).
7. **Primeiro admin:** no Coolify, abra o terminal do serviço `worker` e rode:
   ```bash
   APP_URL=https://mix.seudominio.com.br npx tsx packages/db/src/cli.ts make-admin seu@email.com
   ```
   Ele imprime um link de acesso de uso único (30 min). Entre, vá em **Admin → E-mail**, cadastre o SMTP e teste.
8. **Backups:** agende backup do volume do Postgres (`pgdata`) e dos arquivos (`storage`) no Coolify; sem backup, perder a VPS é perder tudo.

### Outras formas de publicar

- **Cloudflare R2** (para trocar o disco por armazenamento de objetos): crie o bucket e uma chave de API, use `STORAGE_DRIVER=r2` e as variáveis `R2_*`. CORS do bucket:
  ```json
  [{ "AllowedOrigins": ["https://SEU-DOMINIO"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
  ```
  O `ExposeHeaders: ETag` é obrigatório: sem ele o envio em partes não fecha.
- **Fly.io (worker):** `apps/worker/fly.toml` foi mantido só como referência; o alvo atual é o Coolify.
- **CI:** `.github/workflows/ci.yml` roda `npm audit --omit=dev`, typecheck, testes (com libass), migrations em Postgres real, build das duas imagens Docker e valida o compose.

## LGPD e segurança (resumo)

- Cada empresa só acessa os próprios dados; apagar a empresa ou o usuário apaga tudo em cascata (testado), inclusive sessões e links.
- Papéis: `owner`, `editor`, `aprovador` (só lê e baixa). Máximo de 3 pessoas por empresa.
- Nenhuma chave no código: tudo via variáveis de ambiente (`.env*` está no `.gitignore`).
- Migration já aplicada nunca é editada (o executor confere o checksum); mudanças entram numa migration nova.

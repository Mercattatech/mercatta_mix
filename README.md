# Mercatta Mix

SaaS do Grupo Mercatta: pega vídeos brutos e entrega Reels/Shorts cortados, combinados, legendados, com texto SEO, publicados e medidos.
Diferencial: o **Combinador** — 3 ganchos × 2 miolos × 2 chamadas = 12 vídeos, cada um pronto para postar.

> **Status: Fase 1** (upload → transcrição → editor de trechos → combinações → render com legenda → ZIP).
> Arquitetura completa e decisões: `fase0_arquitetura.md` (aprovada).

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/web` | Site (Next.js 16, React 19, Tailwind v4) + rotas de API. Vai para a Vercel. |
| `apps/worker` | Processa a fila: pré-processa, transcreve (faster-whisper), renderiza (FFmpeg + libass), monta ZIP. Vai para o Fly.io (Docker). |
| `packages/core` | Regras puras e testadas: combinações, cortes no limite da palavra, linha do tempo em quadros, legenda ASS, comandos FFmpeg. |
| `packages/db` | Testes do banco (RLS, créditos, LGPD) com PGlite — não precisa de Postgres instalado. |
| `packages/server` | Casos de uso compartilhados por site e worker (uploads, combinações, renders, fila pg-boss). |
| `supabase/migrations` | `0001_core.sql`, `0002_editing.sql`, `0003_realtime.sql` — aplicar nesta ordem. |

## Como rodar (desenvolvimento)

Requisitos: Node ≥ 22.12, FFmpeg no PATH, um projeto Supabase. Não precisa de Docker nem de Cloudflare R2 (o armazenamento local cobre o desenvolvimento).

1. **Instale:** `npm install`
2. **Banco:** no painel do Supabase → SQL Editor, rode em ordem `supabase/migrations/0001_core.sql`, `0002_editing.sql`, `0003_realtime.sql`.
3. **Cadastros fechados:** Authentication → Providers → Email → desligue *Allow new users to sign up* (acesso só por convite).
4. **Convite:** Authentication → URL Configuration → Redirect URLs: adicione `http://localhost:3000/auth/callback`. No template *Invite user*, o link deve levar a `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password` (confira `apps/web/src/app/auth/callback/route.ts`).
5. **Variáveis:** copie `.env.example` para `apps/web/.env.local` e para `apps/worker/.env` e preencha. Em dev use `STORAGE_DRIVER=local` e **o mesmo caminho absoluto** de `LOCAL_STORAGE_DIR` nos dois (caminho relativo valeria para pastas diferentes).
   `DATABASE_URL` deve ser a conexão **direta** ou *session pooler* (porta 5432), nunca a de transações (6543).
6. **Primeiro admin:** crie seu usuário em Authentication → Users e rode no SQL Editor:
   ```sql
   insert into platform_admins (user_id) select id from auth.users where email = 'SEU_EMAIL';
   ```
7. **Rode** (dois terminais):
   ```bash
   npm run start -w @mercatta/worker
   npm run dev -w @mercatta/web
   ```
8. Entre em `http://localhost:3000`, abra **Admin**, crie uma empresa com créditos, convide as pessoas e crie um projeto.

> Transcrição local: o worker usa o Python com `faster-whisper` (veja o `Dockerfile`). Sem ele, use `TRANSCRIBER=openai` + `OPENAI_API_KEY`.

## Como testar

```bash
npm test            # tudo (o teste de aceite leva ~70 s)
npm run typecheck
npm run lint
```

- `packages/core`: 96 testes (combinações, cortes, linha do tempo, ASS, comandos FFmpeg).
- `packages/db`: 63 testes (RLS por empresa, máquina de estados de créditos, apagamento LGPD).
- `packages/server`: 13 testes (renders idempotentes, uploads, limite de 3 min).
- `apps/worker`: **teste de aceite da Fase 1** (`acceptance.integration.test.ts`): 3 ganchos + 2 miolos + 2 chamadas → 12 MP4 1080×1920 ≤ 60 s, sem estalo nas emendas (com controle negativo), erro de sincronia da legenda abaixo de 150 ms (medido: 3,3 ms com palavras sintéticas), créditos reservados/confirmados, reexecução idempotente, ZIP com 12 arquivos `H1_M1_C1.mp4`…
- A legenda queimada (libass) só é testada onde o FFmpeg tem libass: no Docker/CI (`FORCE_ASS_TEST=1`). O FFmpeg do Homebrew do Mac não tem.

## Como publicar (produção)

1. **Cloudflare R2:** crie o bucket e uma chave de API. CORS do bucket:
   ```json
   [{ "AllowedOrigins": ["https://SEU-DOMINIO"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
   O `ExposeHeaders: ETag` é obrigatório: sem ele o envio em partes não fecha.
2. **Vercel (web):** importe o repositório, *Root Directory* `apps/web`, defina as variáveis do `.env.example` (`STORAGE_DRIVER=r2`). Adicione o domínio em Redirect URLs do Supabase.
3. **Fly.io (worker):** `fly launch --no-deploy --copy-config --config apps/worker/fly.toml`, `fly secrets set ...` com as variáveis do worker, `fly deploy --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile .`
4. **CI:** `.github/workflows/ci.yml` roda typecheck, testes (com libass) e o build do Docker.

## Segurança e LGPD (resumo)

- RLS em todas as tabelas: cada empresa só vê os próprios dados; o `service_role` só é usado no servidor, depois de checar permissão.
- Papéis: `owner`, `editor`, `aprovador` (só lê e baixa). Máximo de 3 pessoas por empresa.
- Nenhuma chave no código: tudo via variáveis de ambiente (`.env*` está no `.gitignore`).

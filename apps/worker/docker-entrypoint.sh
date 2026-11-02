#!/bin/sh
# Aplica as migrations pendentes (idempotente, protegido por lock no Postgres) e só então sobe o worker.
set -e
cd /app
echo "[worker] aplicando migrations..."
npx tsx packages/db/src/cli.ts migrate
echo "[worker] iniciando..."
exec npx tsx apps/worker/src/main.ts

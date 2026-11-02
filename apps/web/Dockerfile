# Imagem do site (Next.js, saída "standalone"). Construída a partir da RAIZ do repositório:
#   docker build -f apps/web/Dockerfile -t mercatta-web .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm ci --workspace @mercatta/web --include-workspace-root=false
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN npx next build --webpack

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# pasta do armazenamento local (volume compartilhado com o worker quando STORAGE_DRIVER=local)
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:22-bookworm-slim

# ffmpeg do Debian já vem com libass (legenda queimada). fontes: DejaVu Sans é a fonte padrão da legenda.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-dejavu-core python3 python3-venv python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHON_BIN=/opt/venv/bin/python \
    HF_HOME=/models \
    WHISPER_MODEL=small \
    FONTS_DIR=/usr/share/fonts/truetype/dejavu \
    NODE_ENV=production

# faster-whisper + modelo baixado já na construção da imagem (evita atraso e falha no primeiro vídeo)
COPY apps/worker/python/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
    && /opt/venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
# tsx (que executa o TypeScript) é dependência de produção do worker; testes e web ficam de fora
RUN npm ci --workspace @mercatta/worker --include-workspace-root=false

# conferência de que a imagem tem o que o worker precisa (falha a construção se faltar libass)
RUN ffmpeg -hide_banner -filters | grep -E "\bass\b" \
    && /opt/venv/bin/python -c "import faster_whisper"

USER node
WORKDIR /app/apps/worker
CMD ["npx", "tsx", "src/main.ts"]

# Imagem do worker (fila + FFmpeg + transcrição). Construída a partir da RAIZ do repositório:
#   docker build -f apps/worker/Dockerfile -t mercatta-worker .
FROM node:22-bookworm-slim

# ffmpeg do Debian já vem com libass (legenda queimada). fontes: DejaVu Sans é a fonte padrão da legenda.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-dejavu-core python3 python3-venv python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHON_BIN=/opt/venv/bin/python \
    HF_HOME=/models \
    WHISPER_MODEL=large-v3-turbo \
    FONTS_DIR=/usr/share/fonts/truetype/dejavu \
    TMP_DIR=/tmp/work \
    NODE_ENV=production

# torch só em versão CPU (a padrão do pip puxa ~2 GB de bibliotecas CUDA que o servidor não usa).
# Versão igual à testada na máquina de desenvolvimento (whisperx 3.8.6 exige torch ~=2.8).
COPY apps/worker/python/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

# Modelos baixados já na construção da imagem (evita atraso e falha no primeiro vídeo):
# o transcritor large-v3-turbo e o alinhador wav2vec2 de português. Outros idiomas baixam o alinhador sob demanda.
RUN mkdir -p /models && /opt/venv/bin/python -c "\
from faster_whisper import WhisperModel; \
WhisperModel('large-v3-turbo', device='cpu', compute_type='int8'); \
import whisperx; \
whisperx.load_align_model(language_code='pt', device='cpu')" \
    && chown -R node:node /models

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
# migrations: o worker aplica as pendentes ao iniciar (docker-entrypoint.sh), então leva o pacote db e a pasta db/
COPY db ./db
# tsx (que executa o TypeScript) é dependência de produção do worker; testes e web ficam de fora
RUN npm ci --workspace @mercatta/worker --workspace @mercatta/db --include-workspace-root=false \
    && mkdir -p /data/storage /tmp/work && chown -R node:node /data /tmp/work

# conferência de que a imagem tem o que o worker precisa (falha a construção se faltar libass ou o alinhador)
RUN ffmpeg -hide_banner -filters | grep -E "\bass\b" \
    && /opt/venv/bin/python -c "import faster_whisper, whisperx"

USER node
WORKDIR /app
CMD ["sh", "apps/worker/docker-entrypoint.sh"]

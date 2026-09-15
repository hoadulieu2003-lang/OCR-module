# =========================================================================
# KGLVS Report OCR Engine - Production Dockerfile
# Node.js 20 LTS + Python 3 + PyMuPDF (fitz)
# =========================================================================

FROM node:20-slim AS builder

WORKDIR /app

# Install build essentials & python for native dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install PyMuPDF and OCR packages in system python
RUN pip3 install --no-cache-dir --break-system-packages pymupdf numpy rapidocr_onnxruntime

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY assets ./assets

RUN npm run build

# =========================================================================
# Runner Stage
# =========================================================================
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV PYTHON_PATH=python3

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages pymupdf numpy rapidocr_onnxruntime

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/assets ./assets

RUN mkdir -p /app/data/warehouse /app/uploads

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/v1/health || exit 1

CMD ["node", "dist/server.js"]

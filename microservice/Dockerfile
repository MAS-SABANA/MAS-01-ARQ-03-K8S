# ── Etapa 1: build ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

# ── Etapa 2: runtime (imagen mínima) ──────────────────────────
FROM node:20-alpine

WORKDIR /app

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV PORT=8080 \
    SERVICE_NAME=microservice-demo \
    SERVICE_VERSION=1.0.0

EXPOSE 8080

CMD ["node", "dist/index.js"]

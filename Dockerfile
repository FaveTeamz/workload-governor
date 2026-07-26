# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && addgroup -S app && adduser -S app -G app
COPY --from=builder /app/dist ./dist
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]

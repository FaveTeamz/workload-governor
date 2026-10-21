# syntax=docker/dockerfile:1
# Image: ghcr.io/FaveTeamz/workload-governor:{sha} | :latest

# ── Build arguments ──────────────────────────────────────────────────────────
ARG NODE_ENV=production
ARG PORT=3000

# ── Stage 1: builder ─────────────────────────────────────────────────────────
# Installs all dependencies (including devDependencies) and compiles TypeScript.
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY tsconfig.json .
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev --legacy-peer-deps

# ── Stage 2: runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ARG NODE_ENV=production
ARG PORT=3000

ENV NODE_ENV=${NODE_ENV}
ENV PORT=${PORT}

# Copy compiled artifacts, production dependencies, and package metadata
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

USER node

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]

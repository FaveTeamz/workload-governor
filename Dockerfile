# syntax=docker/dockerfile:1
# Image: ghcr.io/FaveTeamz/workload-governor:{sha} | :latest

# ── Build arguments ──────────────────────────────────────────────────────────
ARG NODE_ENV=production
ARG PORT=3000

# ── Stage 1: builder ─────────────────────────────────────────────────────────
# Installs all dependencies (including devDependencies) and compiles TypeScript.
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching — dependencies are only
# reinstalled when package*.json changes.
COPY package*.json ./

# Install all dependencies (dev + prod) needed for TypeScript compilation.
# --ignore-scripts prevents potentially unsafe postinstall scripts.
RUN npm ci --ignore-scripts

# Copy TypeScript config and source files only (not test files, docs, etc.)
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript → dist/
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
# Minimal production image — no dev dependencies, no source files, no build tools.
FROM node:20-alpine AS runtime

# Re-declare build args so they are in scope for this stage
ARG NODE_ENV=production
ARG PORT=3000

ENV NODE_ENV=${NODE_ENV} \
    PORT=${PORT}

WORKDIR /app

# Install only production dependencies.
# Files are owned by the built-in node user (uid 1000) from the start.
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy compiled output from builder stage only — no source, no tests.
COPY --chown=node:node --from=builder /app/dist ./dist

# Run as the built-in non-root node user (uid 1000, gid 1000).
USER node

EXPOSE ${PORT}

# Probe the health endpoint; container is considered unhealthy after 3 failures.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/health" || exit 1

CMD ["node", "dist/index.js"]

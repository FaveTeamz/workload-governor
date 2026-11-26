# syntax=docker/dockerfile:1
# Image: ghcr.io/FaveTeamz/workload-governor-frontend:{sha} | :latest

# ── Build arguments ───────────────────────────────────────────────────────────
ARG NODE_VERSION=22
ARG PORT=3000

# ── Stage 1: deps ────────────────────────────────────────────────────────────
# Installs ALL dependencies (including devDependencies) needed to compile the
# Next.js app.  Separated so this layer is cached independently of source
# changes.
FROM node:${NODE_VERSION}-alpine AS deps

WORKDIR /app

# Install native build toolchain only long enough to compile any native addons.
# apk cache is discarded in the same RUN layer to keep the layer small.
RUN apk add --no-cache libc6-compat

COPY package-lock.json package.json ./
RUN npm ci --legacy-peer-deps

# ── Stage 2: builder ──────────────────────────────────────────────────────────
# Copies source + pre-installed node_modules from deps, then runs next build.
# next.config.js sets output:'standalone', so the finished artifact is a
# self-contained server in .next/standalone with its own minimal node_modules.
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# Copy deps
COPY --from=deps /app/node_modules ./node_modules

# Copy source (dockerignore keeps .next/, node_modules, test files out)
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
# Final image — contains only the standalone server output.  No source, no
# devDependencies, no compiler toolchain.
FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app

ARG PORT=3000
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=${PORT} \
    HOSTNAME=0.0.0.0

# Principle of least privilege: run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# next build --output standalone writes a self-contained server to
# .next/standalone.  Static assets and the public/ directory must be copied
# separately because standalone deliberately excludes them to keep size down.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

USER nextjs

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/health 2>/dev/null \
      || wget -qO- http://localhost:${PORT} 2>/dev/null \
      || exit 1

# next start in standalone mode is a plain Node process — no shell needed.
CMD ["node", "server.js"]

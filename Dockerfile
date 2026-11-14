# ----------------------------------------------------------------------------
# NutTiew multi-stage Docker build (GH-02, Issue #61)
# Reproducible from a clean clone: no host node_modules/dist, no .env files.
# Stages:
#   * builder  - install locked deps, generate Prisma client, build API + web.
#   * migrate  - one-shot DB init: run migrations then apply runtime grants.
#   * runtime  - lean production image serving the built UI + API on one port.
# ----------------------------------------------------------------------------
#### Build stage: full toolchain + dev deps for a deterministic local build.
FROM node:24-bookworm-slim AS builder
WORKDIR /app
# Prisma's query/engine generation needs OpenSSL to detect the runtime SSL
# version; without it Prisma warns and defaults to openssl-1.1.x (wrong on
# bookworm/OpenSSL 3). Install it so migration/generate run correctly.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Copy workspace manifests first for better layer caching (npm workspaces).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
# Copy remaining source (respecting .dockerignore excludes).
COPY . .
# Generate the Prisma client into node_modules and compile both workspaces.
RUN npm run db:generate \
 && npm run build

#### Migrate stage: one-shot, owner-privileged DB init (runs migrations + grants).
FROM builder AS migrate
WORKDIR /app
# CMD inherited below resolves at /app; Compose sets working_dir to apps/api so
# prisma resolves ./prisma.config.ts and the prisma/ directory.
ENV CI=true
CMD ["node", "/app/compose/init-db.mjs"]

#### Runtime stage: lean image with only production deps and built artifacts.
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# CA certs for TLS if the DB connection string uses verify-full / TLS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Production-only node_modules (keeps prebuilt native argon2 binary, no dev tools).
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev
# Built API (compiled TS + bundled prisma seed) and built React UI.
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/web/dist ./apps/web/dist
# Single-origin static serving of the built UI (see apps/api/src/server.ts).
ENV WEB_DIST=/app/apps/web/dist
# Cloud Run / container public HTTP port; PORT is honored from the environment.
ENV PORT=3001
EXPOSE 3001
# API entrypoint compiled from src/server.ts (see apps/api/tsconfig.json).
CMD ["node", "apps/api/dist/src/server.js"]
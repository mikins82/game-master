# ---------------------------------------------------------------------------
# Game Master — monorepo build image
# Used by all services in docker-compose.yml with different CMD overrides.
# ---------------------------------------------------------------------------

FROM node:20-alpine

RUN corepack enable

WORKDIR /app

# -- 1. Copy workspace config (for layer caching) --------------------------
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./

# -- 2. Copy every package.json so pnpm can resolve the workspace graph -----
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/realtime/package.json apps/realtime/
COPY apps/llm-orchestrator/package.json apps/llm-orchestrator/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/

# -- 3. Install all dependencies (layer cached until a package.json changes) -
RUN pnpm install --frozen-lockfile

# -- 4. Copy source code + assets -------------------------------------------
COPY packages/ packages/
COPY apps/ apps/

# -- 5. Next.js build-time env vars (browser-side, baked into bundle) --------
ENV NEXT_PUBLIC_API_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_WS_URL=ws://localhost:8082/ws

# -- 6. Build everything (turbo handles dependency order) --------------------
RUN pnpm turbo build

# Default — overridden per service in docker-compose.yml
CMD ["echo", "Override CMD in docker-compose.yml"]

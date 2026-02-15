# Game Master — Run Instructions

Complete guide to running all services (frontend, backend, and infrastructure).

---

## Prerequisites

| Requirement       | Version      | Notes                                    |
| ----------------- | ------------ | ---------------------------------------- |
| Node.js           | 20+          | See `.nvmrc` — run `nvm use` if using nvm |
| pnpm              | 9.15.4+      | Install: `corepack enable && corepack prepare pnpm@9.15.4 --activate` |
| Docker & Compose  | Latest       | Needed for PostgreSQL and Redis          |
| OpenAI API key    | —            | Required for LLM orchestrator and worker |

---

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌────────────────────┐
│   Web (Next)  │────▶│   API (Fast)  │────▶│   PostgreSQL 16    │
│   :3000       │     │   :3001       │     │   :5433 (pgvector) │
└──────┬───────┘     └──────┬───────┘     └────────────────────┘
       │                    │                        ▲
       │ ws                 │ bullmq                 │
       ▼                    ▼                        │
┌──────────────┐     ┌──────────────┐     ┌─────────┴──────────┐
│  Realtime     │────▶│   Worker      │────▶│   Redis 7          │
│  :8082        │     │   :8084*      │     │   :6379             │
└──────┬───────┘     └──────────────┘     └────────────────────┘
       │
       │ http
       ▼
┌──────────────────┐
│ LLM Orchestrator  │
│ :8083             │
└──────────────────┘

* Worker :8084 is health-check only, not a public API.
```

### Services

| Service              | Package Name                    | Port  | Description                              |
| -------------------- | ------------------------------- | ----- | ---------------------------------------- |
| **Web**              | `@game-master/web`              | 3000  | Next.js 15 frontend (React 19, Tailwind) |
| **API**              | `@game-master/api`              | 3001  | Fastify REST API (auth, CRUD, uploads)   |
| **Realtime**         | `@game-master/realtime`         | 8082  | WebSocket game server (event sourcing)   |
| **LLM Orchestrator** | `@game-master/llm-orchestrator` | 8083  | OpenAI integration (prompts, RAG, tools) |
| **Worker**           | `@game-master/worker`           | 8084* | BullMQ background jobs (embeddings, PDF) |
| **PostgreSQL**       | —                               | 5433  | Database with pgvector extension         |
| **Redis**            | —                               | 6379  | Queue broker and cache                   |

---

## Environment Setup

```bash
# 1. Copy the example env file
cp .env.example .env

# 2. Edit .env and set your OpenAI API key
#    Replace sk-your-key-here with your actual key
```

### `.env` variables reference

```env
# PostgreSQL (use port 5433 for local dev, 5432 inside Docker network)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/game_master

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=dev-secret-change-in-production
AUTH_MODE=dev

# OpenAI  ← YOU MUST SET THIS
OPENAI_API_KEY=sk-your-key-here

# Inter-service auth
INTERNAL_SECRET=dev-internal-secret

# Dice roll HMAC signing
DICE_SIGNING_SECRET=dev-dice-signing-secret

# Worker health-check port
WORKER_HEALTH_PORT=8084

# LLM Orchestrator URL (used by realtime service)
ORCHESTRATOR_URL=http://localhost:8083
```

> **Important:** When running locally (not in Docker), the PostgreSQL port is **5433** (mapped from container 5432). Make sure your `DATABASE_URL` uses port `5433`.

---

## Option A: Docker Compose (Full Stack — Easiest)

Runs **everything** in containers including frontend, backend, and infrastructure.

```bash
# Start the entire stack (builds images, runs migrations, starts all services)
docker compose up --build

# Or in detached mode (background)
docker compose up -d --build

# Watch logs in detached mode
docker compose logs -f

# Watch logs for a specific service
docker compose logs -f api
docker compose logs -f web

# Stop everything
docker compose down

# Stop and remove volumes (deletes database data)
docker compose down -v
```

### What happens on `docker compose up`:

1. **PostgreSQL** starts and waits for health check
2. **Redis** starts and waits for health check
3. **Migrate** container runs database migrations, then exits
4. **API**, **Realtime**, **LLM Orchestrator**, and **Worker** start (after migrate succeeds)
5. **Web** starts (after API and Realtime are healthy)

### Access points:

- Frontend: http://localhost:3000
- API: http://localhost:3001
- API health check: http://localhost:3001/api/health
- WebSocket: ws://localhost:8082
- LLM Orchestrator: http://localhost:8083

> **Note:** The `OPENAI_API_KEY` is passed from your host `.env` file into the Docker containers for `llm-orchestrator` and `worker`. Make sure it is set before running `docker compose up`.

---

## Option B: Local Development (Recommended for Dev)

Run infrastructure in Docker, application services natively with hot-reload.

### Step 1 — Start Infrastructure

```bash
# Start only PostgreSQL and Redis in Docker
docker compose up -d postgres redis
```

Verify they are running:

```bash
docker compose ps
# Both should show "healthy"
```

### Step 2 — Install Dependencies

```bash
# Install all workspace dependencies
pnpm install
```

### Step 3 — Run Database Migrations

```bash
# Run migrations
pnpm --filter @game-master/db db:migrate

# (Optional) Seed the database with test data
pnpm --filter @game-master/db db:seed
```

### Step 4 — Start All Services at Once

The simplest way — Turborepo starts all `dev` scripts in parallel:

```bash
pnpm dev
```

This starts **all five services** with hot-reload. Output from all services is interleaved in the terminal.

### Step 4 (Alternative) — Start Services Individually

If you prefer separate terminals for each service (easier to read logs):

```bash
# Terminal 1 — API (port 3001)
pnpm --filter @game-master/api dev

# Terminal 2 — Realtime WebSocket server (port 8082)
pnpm --filter @game-master/realtime dev

# Terminal 3 — LLM Orchestrator (port 8083)
pnpm --filter @game-master/llm-orchestrator dev

# Terminal 4 — Worker (background jobs)
pnpm --filter @game-master/worker dev

# Terminal 5 — Web Frontend (port 3000)
pnpm --filter @game-master/web dev
```

### Access points (same as Docker):

- Frontend: http://localhost:3000
- API: http://localhost:3001
- WebSocket: ws://localhost:8082
- LLM Orchestrator: http://localhost:8083

---

## Database Management

All database commands are run through the `@game-master/db` package:

```bash
# Run pending migrations
pnpm --filter @game-master/db db:migrate

# Generate a new migration after schema changes
pnpm --filter @game-master/db db:generate

# Seed the database with test data
pnpm --filter @game-master/db db:seed

# Open Drizzle Studio (visual database browser)
pnpm --filter @game-master/db db:studio
```

### Connect directly to PostgreSQL

```bash
# Via Docker
docker compose exec postgres psql -U postgres -d game_master

# Or with psql locally (if installed)
psql postgresql://postgres:postgres@localhost:5433/game_master
```

---

## Build & Test

```bash
# Build all packages and apps
pnpm build

# Type-check everything
pnpm typecheck

# Lint everything
pnpm lint

# Run all tests
pnpm test

# Run tests for a specific service
pnpm --filter @game-master/api test
pnpm --filter @game-master/realtime test
pnpm --filter @game-master/llm-orchestrator test
pnpm --filter @game-master/worker test
pnpm --filter @game-master/web test
pnpm --filter @game-master/db test

# Run tests in watch mode (for a specific service)
pnpm --filter @game-master/api test:watch
```

---

## Troubleshooting

### Port already in use

```bash
# Find what's using a port (e.g., 3001)
lsof -i :3001

# Kill it
kill -9 <PID>
```

### Database connection refused

- Confirm PostgreSQL is running: `docker compose ps postgres`
- Confirm you're using port **5433** in your local `DATABASE_URL` (not 5432)
- Restart: `docker compose restart postgres`

### Redis connection refused

- Confirm Redis is running: `docker compose ps redis`
- Restart: `docker compose restart redis`

### Docker build fails

```bash
# Clean rebuild from scratch
docker compose down -v
docker compose build --no-cache
docker compose up
```

### pnpm install issues

```bash
# Clear pnpm store and reinstall
pnpm store prune
rm -rf node_modules
pnpm install
```

### Migration fails

```bash
# Check PostgreSQL logs
docker compose logs postgres

# Re-run migrations
pnpm --filter @game-master/db db:migrate
```

### OpenAI errors

- Verify your `OPENAI_API_KEY` is set in `.env`
- Check the LLM orchestrator logs: `docker compose logs llm-orchestrator` or check the terminal running the orchestrator
- Ensure your API key has sufficient credits/quota

---

## Quick Reference

### Start everything (Docker)

```bash
cp .env.example .env        # first time only
# edit .env → set OPENAI_API_KEY
docker compose up --build
```

### Start everything (Local dev)

```bash
cp .env.example .env        # first time only
# edit .env → set OPENAI_API_KEY, set DATABASE_URL port to 5433
docker compose up -d postgres redis
pnpm install
pnpm --filter @game-master/db db:migrate
pnpm dev
```

### Stop everything

```bash
# Docker
docker compose down

# Local dev — Ctrl+C in the terminal running pnpm dev, then:
docker compose down
```

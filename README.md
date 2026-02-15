# Game Master

An AI-powered tabletop RPG platform where an LLM serves as the Dungeon Master. Players connect in real-time via WebSocket, submit actions in natural language, and receive narrative responses with authoritative dice rolls, state mutations, and entity creation -- all driven by OpenAI tool-calling against a 5e SRD ruleset.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Services](#services)
  - [apps/api -- REST API](#appsapi----rest-api)
  - [apps/realtime -- WebSocket Game Server](#appsrealtime----websocket-game-server)
  - [apps/llm-orchestrator -- LLM Integration](#appsllm-orchestrator----llm-integration)
  - [apps/worker -- Background Jobs](#appsworker----background-jobs)
  - [apps/web -- Player UI](#appsweb----player-ui)
  - [packages/shared -- Contract Types](#packagesshared----contract-types)
  - [packages/db -- Database Layer](#packagesdb----database-layer)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Setup](#environment-setup)
  - [Infrastructure](#infrastructure)
  - [Database Setup](#database-setup)
  - [Running Services](#running-services)
  - [Docker Compose (Full Stack)](#docker-compose-full-stack)
- [Feature Walkthrough](#feature-walkthrough)
  - [1. Authentication](#1-authentication)
  - [2. Campaign Management](#2-campaign-management)
  - [3. Character Creation](#3-character-creation)
  - [4. Starting a Game Session](#4-starting-a-game-session)
  - [5. The Game Loop](#5-the-game-loop)
  - [6. Dice Rolls](#6-dice-rolls)
  - [7. State Patches](#7-state-patches)
  - [8. Entity Creation](#8-entity-creation)
  - [9. RAG Document Ingestion](#9-rag-document-ingestion)
  - [10. Reconnect and Resume](#10-reconnect-and-resume)
- [WebSocket Protocol](#websocket-protocol)
- [Tool-Calling System](#tool-calling-system)
- [Testing](#testing)
- [Project Status](#project-status)
- [Known Issues](#known-issues)
- [Roadmap](#roadmap)
- [Documentation](#documentation)

---

## Architecture Overview

Game Master uses a **service-oriented, event-sourced architecture** with strict separation between authoritative and non-authoritative components.

```
┌─────────────┐     REST      ┌─────────────┐
│   apps/web  │──────────────>│   apps/api  │
│  (Next.js)  │               │  (Fastify)  │
└──────┬──────┘               └──────┬──────┘
       │ WebSocket                   │ BullMQ
       v                             v
┌──────────────┐   HTTP POST  ┌─────────────┐
│apps/realtime │─────────────>│apps/llm-    │
│  (Fastify +  │              │orchestrator │
│  WebSocket)  │              │  (Fastify)  │
└──────┬───────┘              └──────┬──────┘
       │                             │
       │         ┌───────────┐       │
       └────────>│PostgreSQL │<──────┘
                 │+ pgvector │
                 └─────┬─────┘
                       │
                 ┌─────┴─────┐
                 │   Redis   │
                 └─────┬─────┘
                       │
                 ┌─────┴──────┐
                 │apps/worker │
                 │ (BullMQ)   │
                 └────────────┘
```

**Core principles:**

- **Realtime is authoritative**: Only the realtime server writes game events, validates actions, and mutates state. The LLM _proposes_ actions; realtime _executes_ them.
- **Event sourcing**: Every game action produces ordered, immutable events. A snapshot checkpoint enables fast resume without full replay.
- **Contract-first**: All service boundaries are defined by Zod schemas in `packages/shared`. Tool names, event names, and message types are canonically frozen.
- **RAG-enhanced narration**: Uploaded campaign lore and rule references are chunked, embedded, and retrieved to provide the LLM with relevant context.

---

## Tech Stack

| Layer                | Technology                                          |
| -------------------- | --------------------------------------------------- |
| **Runtime**          | Node.js 20, TypeScript (ES2022)                     |
| **Monorepo**         | pnpm 9, Turborepo 2                                 |
| **API Framework**    | Fastify 5                                           |
| **Frontend**         | Next.js 15, React 19, Tailwind CSS 4                |
| **Database**         | PostgreSQL 16 + pgvector (vector similarity search) |
| **ORM**              | Drizzle ORM                                         |
| **Queue**            | BullMQ + Redis 7                                    |
| **LLM**              | OpenAI API (gpt-4o-mini default, configurable)      |
| **Auth**             | JWT (@fastify/jwt for REST, jose for WebSocket)     |
| **Validation**       | Zod (shared schemas across all services)            |
| **Testing**          | Vitest, React Testing Library                       |
| **Containerization** | Docker, Docker Compose                              |

---

## Project Structure

```
game-master/
├── apps/
│   ├── api/                    # REST API -- auth, campaigns, characters, uploads
│   ├── realtime/               # WebSocket game server -- event sourcing, dice, tools
│   ├── llm-orchestrator/       # LLM integration -- prompts, tool-calling, RAG
│   ├── worker/                 # Background jobs -- ingestion, embeddings, summaries
│   └── web/                    # Next.js frontend -- game session UI
├── packages/
│   ├── shared/                 # Zod schemas, enums, contract types
│   └── db/                     # Drizzle schema, migrations, seed
├── tests/
│   └── acceptance/             # End-to-end acceptance tests
├── docs/                       # Architecture and design documentation
├── docker-compose.yml          # Full stack orchestration
├── Dockerfile                  # Multi-stage monorepo build
├── turbo.json                  # Turborepo pipeline config
├── pnpm-workspace.yaml         # Workspace definition
└── package.json                # Root scripts
```

---

## Services

### `apps/api` -- REST API

Fastify HTTP server handling authentication, campaign/character CRUD, file upload queueing, and WebSocket token issuance. This is the gateway for the web frontend.

| Endpoint                       | Method | Auth | Description                                                  |
| ------------------------------ | ------ | ---- | ------------------------------------------------------------ |
| `POST /api/auth/register`      | POST   | No   | Create account (email, username, password)                   |
| `POST /api/auth/login`         | POST   | No   | Login, receive JWT (7-day expiry)                            |
| `POST /api/auth/refresh`       | POST   | Yes  | Re-issue JWT                                                 |
| `POST /api/campaigns`          | POST   | Yes  | Create campaign (auto-joins as DM, creates initial snapshot) |
| `GET /api/campaigns`           | GET    | Yes  | List user's campaigns                                        |
| `GET /api/campaigns/:id`       | GET    | Yes  | Campaign detail with player list (membership required)       |
| `POST /api/campaigns/:id/join` | POST   | Yes  | Join campaign as player                                      |
| `POST /api/characters`         | POST   | Yes  | Create character (campaign membership required)              |
| `PATCH /api/characters/:id`    | PATCH  | Yes  | Update character data (ownership required)                   |
| `GET /api/characters`          | GET    | Yes  | List characters for a campaign                               |
| `POST /api/uploads`            | POST   | Yes  | Queue document for RAG ingestion (DM only)                   |
| `POST /api/ws-token`           | POST   | Yes  | Issue short-lived (60s) WebSocket auth token                 |
| `GET /api/health`              | GET    | No   | Health check                                                 |

**Plugins**: JWT auth (with dev-mode bypass), Drizzle DB decorator, in-memory rate limiting (100 req/min global, 10 req/min auth).

**Port**: 3001 (default)

---

### `apps/realtime` -- WebSocket Game Server

The authoritative game server. Manages WebSocket connections, validates all game actions, executes tool calls, maintains event ordering, and broadcasts events to connected players.

**Key responsibilities:**

- **WebSocket lifecycle**: Connect, authenticate (JWT or dev token), join campaign rooms
- **Event sourcing**: Atomic event append with row-level locking, monotonically increasing sequence numbers
- **Tool execution**: Dice rolls (cryptographic RNG with HMAC signatures), state patches (validated against snapshot), entity creation, audio cues
- **Orchestrator bridge**: HTTP call to llm-orchestrator with game context, fallback narration on failure
- **Room management**: In-memory campaign rooms with broadcast/direct messaging
- **Reconnect support**: Replay events from `last_seq_seen` on rejoin

**Port**: 8082 (default)

---

### `apps/llm-orchestrator` -- LLM Integration

Internal HTTP service that receives game context from realtime, assembles prompts, calls OpenAI with function-calling mode, validates output against shared Zod schemas, and returns narration + tool call proposals.

**Pipeline:**

1. Receive snapshot + recent events + player action from realtime
2. Embed player action text, retrieve relevant RAG chunks via pgvector cosine similarity
3. Build system prompt (DM persona, rules, output format) + user message (context, events, action)
4. Call OpenAI with 5 tool definitions (roll, apply_state_patch, create_entity, rag_search, trigger_audio)
5. Parse and validate tool calls against Zod schemas, inject campaign_id
6. Return narration + validated tool calls + usage data

**Features**: Per-campaign rate limiting (30 calls/min), internal service auth, cost estimation logging, graceful LLM failure fallback.

**Port**: 8083 (default)

---

### `apps/worker` -- Background Jobs

BullMQ workers for async document processing and campaign summarization.

**Ingestion pipeline** (triggered by API upload):

1. Download file from URL
2. Extract text (PDF via `pdf-parse`, or plain text/markdown)
3. Chunk into ~500-token paragraphs with overlap
4. Batch embed via OpenAI `text-embedding-3-small` (1536 dimensions)
5. Persist `rag_chunk` rows for vector similarity search

**Summary worker** (summarizes event ranges into campaign summaries for LLM context compression).

**Port**: 8084 (health check only)

---

### `apps/web` -- Player UI

Next.js 15 (React 19) frontend with a dark fantasy theme and gold accent design system. Provides the complete player experience from registration to live game sessions.

**Pages:**

- `/` -- Landing, redirects to `/campaigns` or `/login`
- `/login` -- Email/password login
- `/register` -- Account creation
- `/campaigns` -- Campaign list with creation dialog
- `/campaigns/[id]` -- Campaign detail, join flow, character selection
- `/campaigns/[id]/session` -- Live game session with WebSocket connection

**Session UI components:**

- **EventStream**: Scrollable timeline of game events
- **EventCard**: Renders all 9 event types (narration, dice, patches, entities, audio, errors)
- **ActionInput**: Natural language action submission
- **StateSidebar**: Live snapshot display (mode, location, characters, scene)
- **ConnectionIndicator**: Real-time connection status

**WebSocket hook** (`useGameSocket`): Full lifecycle management with exponential backoff reconnect, ping keepalive, event deduplication by sequence number, and auto-ack.

**Port**: 3000 (default)

---

### `packages/shared` -- Contract Types

Single source of truth for all service boundaries. Exports Zod schemas and TypeScript types for:

- **5 tool schemas**: `roll`, `apply_state_patch`, `create_entity`, `rag_search`, `trigger_audio`
- **9 event payloads**: `player_action`, `dm_narration`, `roll_requested`, `roll_result`, `state_patch_requested`, `state_patch_applied`, `entity_created`, `audio_cue`, `error_note`
- **10 WebSocket messages**: 5 client-to-server + 5 server-to-client (discriminated unions)
- **Enums**: PatchOp, EntityType, GameMode, Intensity, ToolName, EventName
- **Snapshot schema**: GameSnapshot, TurnState, RulesFlags

---

### `packages/db` -- Database Layer

Drizzle ORM schema definitions, PostgreSQL client factory, migration runner, and seed script.

- **11 tables** covering users, campaigns, characters, NPCs, locations, events, snapshots, summaries, and RAG documents/chunks
- **pgvector** custom type for 1536-dimension embeddings with HNSW indexing
- **Migrations** generated via `drizzle-kit`

---

## Database Schema

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  app_user   │────<│ campaign_player  │>────│  campaign   │
└──────┬──────┘     └──────────────────┘     └──────┬──────┘
       │                                            │
       │            ┌──────────────────┐            │
       └───────────>│   character      │<───────────┤
                    └──────────────────┘            │
                                                    │
                    ┌──────────────────┐            │
                    │      npc         │<───────────┤
                    └──────────────────┘            │
                    ┌──────────────────┐            │
                    │    location      │<───────────┤
                    └──────────────────┘            │
                    ┌──────────────────┐            │
                    │   game_event     │<───────────┤  (event sourcing)
                    │  (campaign, seq) │            │
                    └──────────────────┘            │
                    ┌──────────────────┐            │
                    │  game_snapshot   │<───────────┤  (1 per campaign)
                    │   (last_seq)     │            │
                    └──────────────────┘            │
                    ┌──────────────────┐            │
                    │campaign_summary  │<───────────┤
                    └──────────────────┘            │
                    ┌──────────────────┐            │
                    │  rag_document    │<───────────┘
                    └───────┬──────────┘
                            │
                    ┌───────┴──────────┐
                    │   rag_chunk      │  (vector(1536), HNSW index)
                    └──────────────────┘
```

Key invariants:

- `game_event(campaign_id, seq)` is unique -- strict monotonic ordering per campaign
- `game_snapshot` has one row per campaign, `last_seq` matches the latest event
- Event appends and snapshot updates happen in the same transaction
- `rag_chunk.embedding` uses HNSW index for approximate nearest-neighbor search

---

## Getting Started

### Prerequisites

- **Node.js** 20+ (see `.nvmrc`)
- **pnpm** 9+
- **Docker** and **Docker Compose** (for PostgreSQL + Redis)
- **OpenAI API key** (for LLM orchestration and embeddings)

### Environment Setup

Copy the example env and fill in your values:

```bash
cp .env.example .env
```

Key environment variables:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/game_master

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-secret-key
AUTH_MODE=dev                    # Use "production" for real JWT verification

# OpenAI
OPENAI_API_KEY=sk-your-key-here
LLM_MODEL=gpt-4o-mini           # Or gpt-4o, gpt-4.1-mini, etc.

# Internal service auth
INTERNAL_SECRET=dev-internal-secret

# Ports (defaults)
API_PORT=3001
WS_PORT=8082
ORCHESTRATOR_PORT=8083
WORKER_PORT=8084
```

### Infrastructure

Start PostgreSQL (with pgvector) and Redis:

```bash
docker compose up -d postgres redis
```

### Database Setup

Run migrations and optionally seed test data:

```bash
# Run migrations
pnpm --filter @game-master/db migrate

# Seed test data (optional)
pnpm --filter @game-master/db seed
```

### Running Services

In development, start each service individually:

```bash
# Terminal 1 -- API
pnpm --filter @game-master/api dev

# Terminal 2 -- Realtime
pnpm --filter @game-master/realtime dev

# Terminal 3 -- LLM Orchestrator
pnpm --filter @game-master/llm-orchestrator dev

# Terminal 4 -- Worker
pnpm --filter @game-master/worker dev

# Terminal 5 -- Web
pnpm --filter @game-master/web dev
```

Or use Turborepo to start everything:

```bash
pnpm dev
```

### Docker Compose (Full Stack)

To run the complete stack in containers:

```bash
docker compose up --build
```

This starts all 5 services + PostgreSQL + Redis with automatic migration.

---

## Feature Walkthrough

### 1. Authentication

Register a new account and receive a JWT for subsequent requests.

```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "player@example.com", "username": "player1", "password": "secret123"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "player@example.com", "password": "secret123"}'
# Returns: { "token": "eyJ...", "user": { "id": "uuid", "email": "...", "username": "..." } }
```

### 2. Campaign Management

Create campaigns, list your campaigns, and invite players.

```bash
# Create campaign (you become the DM)
curl -X POST http://localhost:3001/api/campaigns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Lost Mines of Phandelver", "ruleset": "5e"}'

# List your campaigns
curl http://localhost:3001/api/campaigns \
  -H "Authorization: Bearer $TOKEN"

# Get campaign details
curl http://localhost:3001/api/campaigns/$CAMPAIGN_ID \
  -H "Authorization: Bearer $TOKEN"

# Another player joins
curl -X POST http://localhost:3001/api/campaigns/$CAMPAIGN_ID/join \
  -H "Authorization: Bearer $PLAYER_TOKEN"
```

### 3. Character Creation

Players create characters associated with a campaign.

```bash
curl -X POST http://localhost:3001/api/characters \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "uuid",
    "name": "Thorin Ironforge",
    "class": "fighter",
    "level": 1,
    "data": { "str": 16, "dex": 12, "con": 14, "int": 10, "wis": 13, "cha": 8 }
  }'
```

### 4. Starting a Game Session

The web UI flow: Login -> Select campaign -> Choose character -> Enter session. Behind the scenes:

1. Frontend fetches a short-lived WS token: `POST /api/ws-token`
2. Opens WebSocket to `ws://localhost:8082/ws`
3. Sends `client.hello` with the token
4. Receives `server.hello` with session info
5. Sends `client.join` with campaign_id
6. Receives `server.joined` with the current snapshot + any replay events

### 5. The Game Loop

Once in a session, the core turn flow:

```
Player types: "I search the chest for traps"
         │
         v
┌─ client.player_action ────────────────────────────┐
│                                                     │
│  1. Realtime validates membership & rate limit      │
│  2. Appends player_action event (seq N)             │
│  3. Broadcasts to all clients in the campaign       │
│  4. Sends context to LLM Orchestrator               │
│     (snapshot + last 20 events + RAG chunks)        │
│  5. Orchestrator calls OpenAI with tool definitions │
│  6. OpenAI returns narration + tool calls           │
│  7. Orchestrator validates against Zod schemas      │
│  8. Returns to realtime                             │
│  9. Realtime executes tool calls sequentially:      │
│     - roll (server-side dice with HMAC)             │
│     - apply_state_patch (validated mutations)       │
│     - create_entity (NPC/location inserts)          │
│     - trigger_audio (audio cue normalization)       │
│ 10. Each tool produces events (seq N+1, N+2, ...)   │
│ 11. DM narration appended as final event            │
│ 12. All events broadcast to connected clients       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6. Dice Rolls

Dice are **never** client-provided. The LLM requests a roll via tool-calling, and the realtime server generates it using Node.js `crypto.randomInt` with HMAC signature for auditability.

Supported formula: `NdS+M` (e.g., `2d6+3`, `1d20`, `4d8-1`)

Events produced: `roll_requested` (what was asked) -> `roll_result` (individual rolls, total, HMAC signature)

### 7. State Patches

The LLM proposes state changes via `apply_state_patch`. The realtime server validates each patch against the current snapshot before applying.

Supported operations:

- **set**: Set a value at a path (e.g., `snapshot.mode` = `"combat"`)
- **inc**: Increment a numeric value (e.g., `characters.hp` +5)
- **push**: Append to an array (e.g., `characters.conditions` push `"poisoned"`)
- **remove**: Delete a field (e.g., remove an inventory item)

Entity-targeted patches (e.g., patching a character row) are persisted to the database.

### 8. Entity Creation

The LLM can create NPCs and locations during narration:

```json
{
  "tool": "create_entity",
  "entity_type": "npc",
  "name": "Sildar Hallwinter",
  "data": { "role": "quest giver", "disposition": "friendly" }
}
```

These are inserted as database rows and produce `entity_created` events.

### 9. RAG Document Ingestion

DMs can upload campaign lore (PDF, text, markdown) which gets chunked, embedded, and made available for retrieval during gameplay.

**Pipeline**: Upload -> BullMQ queue -> Extract text -> Chunk (~500 tokens with overlap) -> Embed via OpenAI -> Store in pgvector -> Retrieved during LLM context assembly

### 10. Reconnect and Resume

If a player disconnects:

1. On reconnect, client sends `client.join` with `last_seq_seen`
2. Realtime replays all events after that sequence number
3. Client deduplicates by seq and resumes seamlessly
4. Snapshot is always available for instant state recovery

---

## WebSocket Protocol

### Client -> Server

| Type                   | Payload                           | Description                           |
| ---------------------- | --------------------------------- | ------------------------------------- |
| `client.hello`         | `{ token }`                       | Authenticate with WS token            |
| `client.join`          | `{ campaign_id, last_seq_seen? }` | Join campaign room, optionally resume |
| `client.player_action` | `{ text }`                        | Submit game action                    |
| `client.ack`           | `{ last_seq_seen }`               | Acknowledge received events           |
| `client.ping`          | `{}`                              | Keepalive                             |

### Server -> Client

| Type            | Payload                             | Description             |
| --------------- | ----------------------------------- | ----------------------- |
| `server.hello`  | `{ session_id }`                    | Auth success            |
| `server.joined` | `{ campaign_id, snapshot, events }` | Join success with state |
| `server.events` | `{ campaign_id, events[] }`         | New game events         |
| `server.error`  | `{ code, message }`                 | Error notification      |
| `server.pong`   | `{}`                                | Keepalive response      |

---

## Tool-Calling System

The LLM orchestrator defines 5 tools for OpenAI function-calling:

| Tool                | Authority                    | Description                                              |
| ------------------- | ---------------------------- | -------------------------------------------------------- |
| `roll`              | Realtime executes            | Request dice roll (formula, reason, optional actor)      |
| `apply_state_patch` | Realtime validates + applies | Mutate game state (set, inc, push, remove operations)    |
| `create_entity`     | Realtime inserts             | Create NPC or location                                   |
| `rag_search`        | Orchestrator executes        | Search campaign lore / rules (not forwarded to realtime) |
| `trigger_audio`     | Realtime normalizes          | Emit audio cue event (intensity, duration)               |

The LLM **proposes** tool calls. Realtime **validates and executes** them. This separation ensures the LLM cannot corrupt game state.

---

## Testing

The project has **~353 test cases** across **30 test files** using Vitest.

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @game-master/api test
pnpm --filter @game-master/realtime test
pnpm --filter @game-master/llm-orchestrator test
pnpm --filter @game-master/worker test
pnpm --filter @game-master/web test
pnpm --filter @game-master/shared test
pnpm --filter @game-master/db test

# Run acceptance tests (requires all services running)
pnpm --filter acceptance test
```

### Test Distribution

| Package                 | Test Files | Test Cases | Type                                     |
| ----------------------- | ---------- | ---------- | ---------------------------------------- |
| `packages/shared`       | 5          | ~123       | Schema validation (Zod parse)            |
| `apps/llm-orchestrator` | 5          | 50         | Unit + integration (mocked LLM)          |
| `apps/realtime`         | 4          | 49         | Unit + integration (real Postgres + WS)  |
| `apps/worker`           | 6          | 42         | Unit (mocked deps)                       |
| `apps/web`              | 3          | 38         | Component + hook (React Testing Library) |
| `apps/api`              | 5          | 35         | Integration (real Postgres)              |
| `tests/acceptance`      | 1          | 12         | End-to-end (all services)                |
| `packages/db`           | 1          | 4          | Constraint validation (real Postgres)    |

### Testing Approach

- **Integration tests** (API, realtime, db): Run against real PostgreSQL on port 5433; tables are truncated between tests
- **Unit tests** (shared, worker, orchestrator): Zod schema validation, module mocking (`vi.mock`), no I/O
- **Component tests** (web): React Testing Library with jsdom, MockWebSocket for hook tests
- **Acceptance tests**: True E2E against running services, validates the complete turn loop, multiplayer broadcast, reconnect, dice integrity, and auth enforcement

---

## Project Status

### What Has Been Built (Milestones Completed)

| Milestone | Package                                                                      | Status   |
| --------- | ---------------------------------------------------------------------------- | -------- |
| M0        | `packages/shared` -- Contract types, Zod schemas, enums                      | Complete |
| M1        | `packages/db` -- All 11 tables, migrations, pgvector, seed                   | Complete |
| M2        | `apps/api` -- Auth, CRUD, uploads, WS tokens, rate limiting                  | Complete |
| M3        | `apps/realtime` -- WebSocket server, event sourcing, dice, tool execution    | Complete |
| M4        | `apps/llm-orchestrator` -- Prompt assembly, OpenAI integration, RAG, parsing | Complete |
| M5        | `apps/worker` -- Ingestion pipeline, embeddings, summarization               | Complete |
| M6        | `apps/web` -- Full UI (auth, campaigns, game session, dark theme)            | Complete |
| M7        | Integration -- Docker Compose, acceptance tests                              | Complete |

All 8 milestones from the implementation roadmap have been delivered. The core MVP feature set is implemented end-to-end.

### What Works Well

- **Event sourcing engine**: Atomic event append with row-level locking, monotonic sequence numbers, transactional snapshot updates
- **Dice system**: Cryptographic RNG with HMAC signatures for auditability; formula parsing supports NdS+M notation
- **Tool-calling architecture**: Clean separation between LLM proposals and authoritative execution
- **Shared contracts**: Zod schemas enforce type safety across all service boundaries at runtime
- **WebSocket lifecycle**: Reconnect with replay, deduplication, ping/pong keepalive, rate limiting
- **RAG pipeline**: Full ingestion flow (extract -> chunk -> embed -> store -> retrieve)
- **Test coverage**: ~353 tests with a proper testing pyramid (unit -> integration -> acceptance)
- **Dark fantasy UI**: Cohesive design system with gold accents, responsive session layout

---

## Known Issues

### Critical -- Frontend-API Contract Mismatch

The web frontend (`apps/web`) and the REST API (`apps/api`) have **mismatched contracts** that prevent the frontend from communicating with the API correctly in several areas:

1. **Auth response shape**: API returns `{ token, user: { id, email, username } }` but the frontend expects `{ access_token, refresh_token, user_id }`. Auth flow is broken.
2. **Campaign field naming**: API uses `name`/`ruleset` but the frontend sends `title`/`edition`. Campaign creation fails.
3. **Campaign list response**: API returns `{ campaigns: [...] }` but the frontend expects a bare array.
4. **Character schema**: API uses a generic `data` jsonb column, frontend expects typed fields (`sheet`, `resources`, `inventory`, `conditions`).
5. **Default port mismatch**: Frontend defaults to ports `4000`/`4001` but API runs on `3001` and realtime on `8082`. Requires env vars to be set.

### Moderate

6. **Seed password incompatibility**: The seed script uses `scryptSync` for password hashing, but the API uses `bcrypt`. Seeded users cannot log in without re-registering.
7. **Upload-ingestion pipeline disconnect**: The API upload route sends different field names (`filename`, `content_type`) than what the ingestion worker expects (`fileUrl`, `documentId`). The API also doesn't create the `rag_document` database row.
8. **Orchestrator request schema mismatch**: `player_action` is typed as `z.string()` in the orchestrate route but the realtime server sends it as `{ user_id, text }` object.
9. **No campaign-summary trigger**: The summary worker is implemented but nothing enqueues summary jobs. Needs a cron job or API endpoint.
10. **Estimated cost hardcoded**: The orchestrate response always returns `estimated_cost_usd: 0` despite the usage logger calculating it.
11. **OpenAI client instantiation**: `getEmbedding` in the orchestrator creates a new OpenAI instance per call instead of reusing the existing client.

### Low / Hardening

12. **In-memory rooms**: No horizontal scaling for the realtime server without Redis pub/sub
13. **In-memory rate limiter**: Resets on restart, not shared across instances
14. **CORS `origin: true`**: Allows all origins; should be restricted in production
15. **Dev auth bypasses**: `AUTH_MODE=dev` in both API and realtime must be explicitly disabled in production
16. **Hardcoded values**: JWT expiry (7d), WS token expiry (60s), rate limits, chunk sizes

---

## Roadmap

### Immediate Priorities (v1 Stabilization)

- [ ] **Fix frontend-API contract alignment** -- reconcile auth response shapes, campaign field names, character schema, port defaults
- [ ] **Fix seed script** -- use bcrypt to match API's hashing
- [ ] **Wire upload-ingestion pipeline** -- API creates `rag_document` row and sends correct job data
- [ ] **Fix orchestrator player_action type** -- handle object `{ user_id, text }` from realtime
- [ ] **Add campaign-summary trigger** -- cron job or API endpoint to enqueue summary jobs
- [ ] **Return calculated cost in orchestrate response**

### v1.5 Enhancements

- [ ] JWT hardening everywhere (strict production mode)
- [ ] Redis pub/sub for horizontally scaled WebSocket nodes
- [ ] Structured model usage cost tracking and budget controls
- [ ] NPC/location dedicated CRUD routes
- [ ] Campaign and character delete endpoints
- [ ] List pagination and filtering
- [ ] Distributed rate limiting (Redis-backed)
- [ ] CORS origin whitelist for production
- [ ] Optional DM narration TTS pipeline

### v2 Candidates

- [ ] NPC voice profiles
- [ ] Dynamic ambient audio engine
- [ ] Expanded rules packs and content plugins
- [ ] Procedural world generation systems
- [ ] Mobile application

---

## Documentation

Detailed design documents are in the `docs/` directory:

| Document                                                          | Description                                        |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| [01-product-overview.md](docs/01-product-overview.md)             | Vision, principles, success criteria               |
| [02-system-architecture.md](docs/02-system-architecture.md)       | Service map, ownership boundaries, runtime flow    |
| [03-canonical-contracts.md](docs/03-canonical-contracts.md)       | Frozen tool names, event names, WS message schemas |
| [04-data-model.md](docs/04-data-model.md)                         | Database schema, storage model, data invariants    |
| [05-mvp-scope.md](docs/05-mvp-scope.md)                           | In/out scope for v1, acceptance criteria           |
| [06-local-dev-and-deploy.md](docs/06-local-dev-and-deploy.md)     | Environment setup, deployment progression          |
| [07-implementation-roadmap.md](docs/07-implementation-roadmap.md) | Milestone plan with dependencies and exit criteria |

---

## License

Private -- All rights reserved.

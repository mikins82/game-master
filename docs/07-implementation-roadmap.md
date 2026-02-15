# Implementation Roadmap

## Context-Optimized Milestones

Each milestone targets **one agent** (service/package). When starting a milestone, load only the listed **context files** into the LLM session. This keeps the context window tight and reduces drift between milestones.

Dependencies flow downward. A milestone's **inputs** must be complete before starting it.

---

## Milestone 0 — `packages/shared` (Contract Foundation)

**Goal:** Establish the single source of truth for all types, schemas, and validation used across every service.

**Context files to load:**

- `docs/03-canonical-contracts.md`
- `docs/04-data-model.md` (table names and snapshot shape only)

**Deliverables:**

1. TypeScript types for all five canonical tools (`roll`, `apply_state_patch`, `create_entity`, `rag_search`, `trigger_audio`).
2. TypeScript types for all nine canonical events (`player_action`, `dm_narration`, `roll_requested`, `roll_result`, `state_patch_requested`, `state_patch_applied`, `entity_created`, `audio_cue`, `error_note`).
3. TypeScript types for WebSocket messages (client `hello | join | player_action | ack | ping`, server `hello | joined | events | error | pong`).
4. Zod schemas matching every type above, exported for runtime validation.
5. Shared enums/constants: patch ops (`set | inc | push | remove`), entity types (`npc | location`), game modes (`free | combat`), intensity levels (`low | mid | high`).
6. A `GameSnapshot` type reflecting the minimum snapshot shape from the data model doc.
7. Barrel `index.ts` exporting everything.

**Inputs:** None (first milestone).

**Exit criteria:**

- `tsc --noEmit` passes with zero errors.
- Every canonical name from `03-canonical-contracts.md` has exactly one corresponding type and one Zod schema.
- No runtime code, no DB dependencies, no service-specific logic.

**Tests:**

- Schema round-trip tests: construct a valid payload, parse it through Zod, assert success.
- Negative tests: malformed payloads are rejected with descriptive errors.

---

## Milestone 1 — `packages/db` (Database Layer)

**Goal:** Create all v1 tables, indexes, and seed utilities. This is the storage foundation for every service that touches Postgres.

**Context files to load:**

- `docs/04-data-model.md`
- `packages/shared` (types from Milestone 0)

**Deliverables:**

1. Migration files creating all core tables: `app_user`, `campaign`, `campaign_player`, `character`, `npc`, `location`, `game_event`, `game_snapshot`, `campaign_summary`, `rag_document`, `rag_chunk`.
2. Required indexes: `game_event(campaign_id, seq)`, `rag_chunk(document_id)`, GIN on `rag_chunk.meta`, vector index on `rag_chunk.embedding`.
3. Enforce `game_event.seq` strict monotonicity per campaign (DB constraint or trigger).
4. Dev seed script that inserts a test user, campaign, and character for downstream milestones.
5. Migration runner CLI command (`db:migrate`, `db:seed`, `db:reset`).

**Inputs:** Milestone 0 complete.

**Exit criteria:**

- `db:migrate` runs cleanly against a fresh Postgres + pgvector instance.
- `db:seed` populates test data queryable from `psql`.
- All indexes exist and are verifiable.

**Tests:**

- Migration idempotency: running migrate twice does not error.
- Constraint tests: inserting a duplicate `game_event.seq` for the same campaign fails.

---

## Milestone 2 — `apps/api` (REST API)

**Goal:** Deliver all non-realtime HTTP endpoints: auth, campaign/character CRUD, upload initiation, and WebSocket token issuance.

**Context files to load:**

- `docs/02-system-architecture.md` (API section only)
- `docs/06-local-dev-and-deploy.md` (auth modes)
- `packages/shared` (types)
- `packages/db` (schema — read-only reference)

**Deliverables:**

1. Auth routes: register, login, token refresh. Dev-mode relaxed auth behind `AUTH_MODE=dev` env flag.
2. Campaign CRUD: create, list, get, join (creates `campaign_player` row).
3. Character CRUD: create, update, list (scoped to user + campaign).
4. WebSocket token issuance: `POST /api/ws-token` returns a short-lived token embedding `user_id` and `campaign_id`.
5. Upload endpoint stub: `POST /api/uploads` accepts file metadata, queues ingestion job (actual processing deferred to worker milestone).
6. Middleware: request validation (Zod from shared), error handling, auth guard.

**Inputs:** Milestones 0 and 1 complete.

**Exit criteria:**

- A user can register, login, create a campaign, add a character, and obtain a WS token via curl/Postman.
- Invalid requests return structured error responses.
- Dev-mode auth bypass works locally; is disabled when `AUTH_MODE != dev`.

**Tests:**

- Route-level integration tests per endpoint (happy path + auth failure + validation failure).
- WS token contains correct claims and expires appropriately.

---

## Milestone 3 — `apps/realtime` (Authoritative Game Server)

**Goal:** Build the authoritative core — WebSocket server, event sourcing, snapshot management, tool execution, and dice engine. This is the largest and most critical milestone.

**Context files to load:**

- `docs/02-system-architecture.md` (Realtime section + Runtime Turn Flow)
- `docs/03-canonical-contracts.md` (full — tool schemas, event payloads, WS messages, authority rules)
- `docs/04-data-model.md` (event/snapshot invariants)
- `packages/shared` (types + schemas)
- `packages/db` (schema — read-only reference)

**Deliverables:**

1. **WebSocket lifecycle:** Handle `client.hello` (auth via WS token), `client.join` (send snapshot + recent events), `client.ping/pong`, `client.ack` (track `last_seq_seen`).
2. **Event append engine:** Atomic transaction that appends `game_event` rows with strictly monotonic `seq`, updates `game_snapshot.last_seq`, and broadcasts `server.events` to all campaign subscribers.
3. **Player action ingestion:** Receive `client.player_action`, validate membership + turn constraints + rate limits, append `player_action` event, then invoke orchestrator (HTTP call to `apps/llm-orchestrator`).
4. **Tool execution pipeline:** Accept tool call proposals from orchestrator, execute in-order:
   - `roll`: parse formula, generate server-side random rolls, compute total, sign result, emit `roll_requested` + `roll_result`.
   - `apply_state_patch`: validate each patch op against legality rules, apply to snapshot, emit `state_patch_requested` + `state_patch_applied` (with any `rejected` patches noted).
   - `create_entity`: validate entity data, insert `npc`/`location` row, emit `entity_created`.
   - `trigger_audio`: validate cue, emit `audio_cue`.
5. **DM narration:** After tool execution, append `dm_narration` event with orchestrator-provided text.
6. **Reconnect/resync:** When a client sends `client.join` with a `last_seq_seen`, send snapshot + events after that seq.
7. **Error handling:** Emit `error_note` event for invalid tool calls or orchestrator failures; never leave the campaign in a broken state.

**Inputs:** Milestones 0 and 1 complete. Milestone 2 recommended (for WS token verification) but can stub token validation initially.

**Exit criteria:**

- Two clients can connect, one sends a player action, both receive the resulting event batch (action + tool results + narration).
- Reconnecting client receives correct catch-up events from `last_seq_seen`.
- Illegal `apply_state_patch` ops are rejected; legal ops update the snapshot.
- Dice results are server-generated and deterministic given a seed (for testing).
- `game_event.seq` is never duplicated or gapped for a campaign.

**Tests:**

- Sequence monotonicity under concurrent writes.
- Replay correctness: rebuild snapshot from events, compare to stored snapshot.
- Tool validation: each tool's accept/reject cases per contract spec.
- WS protocol conformance: message type, payload shape, error codes.

---

## Milestone 4 — `apps/llm-orchestrator` (LLM Orchestration)

**Goal:** Build the non-authoritative orchestration layer that reads context, calls the LLM, and returns structured tool proposals + narration to realtime.

**Context files to load:**

- `docs/02-system-architecture.md` (Orchestrator section + Runtime Turn Flow)
- `docs/03-canonical-contracts.md` (tool schemas only — the orchestrator proposes these)
- `packages/shared` (types + schemas)

**Deliverables:**

1. **Turn endpoint:** `POST /orchestrate` accepts `{ campaign_id, player_action, snapshot, recent_events }` from realtime.
2. **Context assembly:** Build the LLM prompt from:
   - Current snapshot (game mode, location, scene summary, encounter state).
   - Recent events (last N, configurable).
   - Retrieved RAG chunks (call retrieval layer for rules/lore context).
   - System prompt defining the DM role, available tools, and output format.
3. **LLM call:** Send assembled prompt to model (OpenAI-compatible API). Use tool-calling / function-calling mode with the five canonical tool definitions.
4. **Response parsing:** Extract structured tool calls and narration text from model output. Validate each proposed tool call against shared Zod schemas before returning.
5. **Retrieval integration:** Call `rag_search` internally (query the vector store) to fetch relevant rules/lore chunks. Inject into prompt context.
6. **Error handling:** If model output is unparseable or invalid, return a safe fallback (narration-only, no tool calls) rather than crashing the turn.
7. **Cost/usage logging:** Log token counts, model name, and latency per call for observability.

**Inputs:** Milestone 0 complete. Runtime integration requires Milestone 3 (realtime calls orchestrator).

**Exit criteria:**

- Given a snapshot + player action, the orchestrator returns valid tool proposals + narration text.
- Invalid model outputs are caught and fallback response is returned.
- Token usage is logged per request.

**Tests:**

- Unit tests with mocked LLM responses (valid tool calls, invalid tool calls, narration-only, mixed).
- Schema validation tests: every returned tool proposal passes shared Zod validation.
- Retrieval integration test: query returns ranked chunks with expected metadata.

---

## Milestone 5 — `apps/worker` (Background Jobs)

**Goal:** Handle all async processing — document ingestion, chunk embedding, and summary generation.

**Context files to load:**

- `docs/04-data-model.md` (RAG data section)
- `packages/shared` (types)
- `packages/db` (schema — `rag_document`, `rag_chunk`, `campaign_summary` tables)

**Deliverables:**

1. **Job queue setup:** Redis-backed job queue (BullMQ or similar). Jobs triggered by API upload endpoint.
2. **Document ingestion pipeline:**
   - Accept uploaded file reference (PDF, text, markdown).
   - Extract text content (pdf-parse or equivalent).
   - Split into chunks with configurable size/overlap.
   - Persist `rag_document` row with provenance metadata (`source`, `type`, `edition`).
3. **Chunk embedding:** Generate embeddings for each chunk (OpenAI embeddings API or equivalent). Store in `rag_chunk` with embedding vector and metadata.
4. **Campaign summary job:** Periodically or on-demand summarize recent events into `campaign_summary` for long-running campaigns (keeps orchestrator context compact).
5. **Metadata tagging:** Distinguish rules chunks vs. world-lore chunks via `rag_chunk.meta` fields (`source`, `chapter`, `page`, `type`, `edition`).

**Inputs:** Milestones 0 and 1 complete. Milestone 2 recommended (API triggers jobs).

**Exit criteria:**

- Uploading a PDF through the API results in chunked, embedded rows in `rag_chunk`.
- Vector similarity search returns relevant chunks for a test query.
- Metadata filters narrow results correctly.

**Tests:**

- Ingestion pipeline test: file in -> chunks + embeddings in DB.
- Embedding dimension and format validation.
- Summary generation produces coherent output for a sample event sequence.

---

## Milestone 6 — `apps/web` (Player UI)

**Goal:** Build the player-facing frontend — session UI, event rendering, action input, and WebSocket client.

**Context files to load:**

- `docs/03-canonical-contracts.md` (WS messages + event payload contracts)
- `packages/shared` (types — WS message types, event types)

**Deliverables:**

1. **Auth flow:** Login/register forms, token storage, redirect to campaign list.
2. **Campaign lobby:** List campaigns, create new, join existing, select character.
3. **Game session view:**
   - Event stream display: render `dm_narration`, `roll_result`, `state_patch_applied`, `entity_created`, `audio_cue`, `error_note` with appropriate formatting.
   - Player action input: text input that sends `client.player_action`.
   - Connection status indicator.
4. **WebSocket client:**
   - Connect with WS token from API.
   - Handle full `client.*` / `server.*` message protocol.
   - Track `last_seq_seen`; on reconnect, send it in `client.join` for gap recovery.
   - Handle `server.error` gracefully.
5. **Game state sidebar:** Display current snapshot info — location, mode, active characters, scene summary.
6. **Responsive layout:** Functional on desktop; readable on tablet.

**Inputs:** Milestone 0 complete. Runtime requires Milestones 2 (API) and 3 (realtime).

**Exit criteria:**

- A player can register, create/join a campaign, enter a session, send actions, and see narration + dice results in real time.
- A second player in the same campaign sees the same events.
- Disconnecting and reconnecting recovers state without duplicated or missing events.

**Tests:**

- WS client unit tests: message serialization, seq tracking, reconnect logic.
- Component tests: event rendering for each event type.
- E2E smoke test: login -> create campaign -> send action -> see narration.

---

## Milestone 7 — Integration and Hardening

**Goal:** Wire all services together, lock down security, add operational controls, and validate the full turn loop end-to-end.

**Context files to load:**

- `docs/05-mvp-scope.md` (acceptance criteria)
- `docs/06-local-dev-and-deploy.md` (full)
- `docs/02-system-architecture.md` (security modes)

**Deliverables:**

1. **Docker Compose:** Full local stack (Postgres + pgvector, Redis, api, realtime, orchestrator, worker, web).
2. **End-to-end turn loop validation:** `player_action -> realtime validation -> orchestrator call -> tool execution -> event broadcast -> UI render`.
3. **Auth hardening:** JWT verification on WS connections (production mode). Internal service auth (shared secret or mTLS) on orchestrator and worker endpoints.
4. **Rate limiting:** API request limits, WS action throttling, model call budget per campaign.
5. **Monitoring baseline:** Structured logs, health check endpoints per service, basic latency/error dashboards.
6. **Acceptance test suite:** Automated tests covering all five v1 acceptance criteria from `05-mvp-scope.md`.

**Inputs:** All prior milestones complete.

**Exit criteria (maps to v1 acceptance):**

- Multiplayer session runs 30+ minutes without event ordering issues.
- Reconnecting client recovers from `last_seq_seen` with no state mismatch.
- Dice results are never client-provided.
- Illegal state patches are rejected with explicit reasons.
- Narrative remains playable under defined latency and cost budgets.

---

## Dependency Graph

```
M0 (shared)
├── M1 (db)
│   ├── M2 (api)
│   ├── M3 (realtime)  ← largest milestone
│   └── M5 (worker)
├── M4 (orchestrator)  ← runtime needs M3
└── M6 (web)           ← runtime needs M2 + M3

M7 (integration) ← needs all above
```

## Per-Session Context Loading Guide

| Milestone | Required docs to load                                                          | Required packages to load        |
| --------- | ------------------------------------------------------------------------------ | -------------------------------- |
| M0        | `03-canonical-contracts`, `04-data-model`                                      | —                                |
| M1        | `04-data-model`                                                                | `packages/shared`                |
| M2        | `02-system-architecture` (API), `06-local-dev`                                 | `packages/shared`, `packages/db` |
| M3        | `02-system-architecture` (Realtime), `03-canonical-contracts`, `04-data-model` | `packages/shared`, `packages/db` |
| M4        | `02-system-architecture` (Orchestrator), `03-canonical-contracts` (tools)      | `packages/shared`                |
| M5        | `04-data-model` (RAG)                                                          | `packages/shared`, `packages/db` |
| M6        | `03-canonical-contracts` (WS + events)                                         | `packages/shared`                |
| M7        | `05-mvp-scope`, `06-local-dev`, `02-system-architecture`                       | all                              |

## Risk Controls

- Prevent contract drift by requiring `packages/shared` updates before any service change.
- Keep strict MVP scope — any item not in `05-mvp-scope.md` is out.
- Fail safely when model output is invalid (no unsafe state mutation).
- Each milestone is independently testable before moving to the next.

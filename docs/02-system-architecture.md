# System Architecture

## Service Map

- `apps/web`: Player UI, event rendering, action input.
- `apps/api`: Auth, campaign/character CRUD, uploads, ws token issuing.
- `apps/realtime`: Authoritative game server, event writer, snapshot updater, websocket broadcaster.
- `apps/llm-orchestrator`: Prompt assembly, retrieval calls, model call, tool proposal parsing.
- `apps/worker`: Async jobs (ingestion, embeddings, summarization, media generation).
- `packages/shared`: Shared contract types and schemas.
- `packages/db`: SQL migrations and schema management.

## Ownership Boundaries

### Realtime (authoritative)

- Validates action legality and permissions.
- Generates/signs dice outcomes.
- Applies validated state patches.
- Appends canonical events and updates snapshot.
- Broadcasts events to subscribed clients.

### Orchestrator (non-authoritative)

- Reads context (snapshot, recent events, retrieved chunks).
- Calls LLM and parses structured output.
- Proposes tool calls to realtime.
- Never mutates campaign state directly.

### API

- User and campaign management.
- Upload and ingestion initiation.
- Token lifecycle (REST auth and ws token issuance).

### Worker

- PDF/text extraction and chunk embedding.
- Summaries and optional media/TTS generation.

## Runtime Turn Flow

1. Client sends `client.player_action`.
2. Realtime validates membership, turn constraints, and rate limits.
3. Realtime appends `player_action`.
4. Orchestrator runs with latest state + retrieval context.
5. Orchestrator proposes tool calls + narration.
6. Realtime executes tool calls in-order (validated).
7. Realtime appends resulting events and `dm_narration`.
8. Realtime updates snapshot and broadcasts to clients.

## Reliability Pattern

- Event sourcing for replay/audit.
- Snapshot checkpoint for fast resume.
- Client tracks `last_seq_seen`; if gap detected, resync from snapshot + replay.

## Security Modes

- Dev profile: simplified local auth allowed only for local testing.
- Prod profile: JWT verification required on websocket and internal endpoints protected.

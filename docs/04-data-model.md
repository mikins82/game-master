# Data Model

## Storage Model

Use PostgreSQL + pgvector with two complementary persistence paths:

- Event log for audit/replay (`game_event`).
- Snapshot for fast resume/join (`game_snapshot`).

## Core Tables (v1)

- `app_user`
- `campaign`
- `campaign_player`
- `character`
- `npc`
- `location`
- `game_event`
- `game_snapshot`
- `campaign_summary`
- `rag_document`
- `rag_chunk`

## Event and Snapshot Invariants

1. `game_event.seq` is strictly monotonic per campaign.
2. `game_snapshot.last_seq` must match the latest committed event seq for that campaign.
3. Snapshot updates and event appends happen in one transaction when applying tool calls.
4. Realtime is the only service allowed to append authoritative gameplay events.

## Required Indexing

- `game_event(campaign_id, seq)` for replay.
- `rag_chunk(document_id)` for document traversal.
- `rag_chunk.meta` gin index for filtered retrieval.
- vector index on `rag_chunk.embedding` for nearest-neighbor search.

## Snapshot Shape (Minimum)

- campaign and ruleset identifiers
- current mode (`free` or `combat`)
- location reference
- compact scene summary
- encounter turn state when applicable
- rules flags (strictness profile)

## State Mutation Rule

All gameplay state changes must map to:

1. a validated `apply_state_patch` request,
2. corresponding event(s),
3. snapshot update in the same commit.

No direct client-side or orchestrator-side state mutation is allowed.

## RAG Data Guidance

- Keep rules chunks and world-lore chunks distinguishable via metadata.
- Persist provenance metadata (`source`, `chapter`, `page`, `type`, `edition`) for citation/audit.
- Keep chunk size conservative to balance retrieval precision and context budget.

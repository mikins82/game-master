# Canonical Contracts (Source of Truth)

This file defines the only valid contract names for v1. All services must use these names exactly.

## Contract Freeze

### Canonical Tool Names

- `roll`
- `apply_state_patch`
- `create_entity`
- `rag_search`
- `trigger_audio`

Deprecated aliases that must not be implemented:

- `roll_dice`, `apply_damage`, `create_npc`, `update_quest`, `change_location`, `trigger_sound`

### Canonical Event Names

- `player_action`
- `dm_narration`
- `roll_requested`
- `roll_result`
- `state_patch_requested`
- `state_patch_applied`
- `entity_created`
- `audio_cue`
- `error_note`

Deprecated generic names that must not be used in event storage:

- `roll`, `damage`

## WebSocket Messages

### Client -> Server Commands

- `client.hello`
- `client.join`
- `client.player_action`
- `client.ack`
- `client.ping`

### Server -> Client Messages

- `server.hello`
- `server.joined`
- `server.events`
- `server.error`
- `server.pong`

## Tool Schemas (Logical)

### `roll`

Required:

- `campaign_id` (string)
- `formula` (string)
- `reason` (string)

Optional:

- `actor_ref` (`character:<uuid>` | `npc:<uuid>`)
- `tags` (string[])

Validation owner: realtime.

### `apply_state_patch`

Required:

- `campaign_id` (string)
- `reason` (string)
- `patches` (array of patch ops)

Patch fields:

- `op`: `set` | `inc` | `push` | `remove`
- `target`: `snapshot` | `character:<uuid>` | `npc:<uuid>` | `location:<uuid>`
- `path`: json pointer style string
- `value`: any (when required by op)

Validation owner: realtime.

### `create_entity`

Required:

- `campaign_id` (string)
- `entity_type`: `npc` | `location`
- `name` (string)
- `data` (object)

Validation owner: realtime.

### `rag_search`

Required:

- `query` (string)

Optional:

- `campaign_id` (string)
- `edition` (string)
- `k` (integer, default 6)
- `filters` (object)

Execution owner: retrieval layer (api/worker/db), consumed by orchestrator.

### `trigger_audio`

Required:

- `campaign_id` (string)
- `cue` (string)

Optional:

- `intensity`: `low` | `mid` | `high`
- `duration_ms` (integer)

Validation owner: realtime.

## Event Payload Contracts (Minimum)

### `player_action`

- `user_id`, `client_msg_id`, `text`, optional `character_id`

### `dm_narration`

- `text`, optional `options`, optional scene refs

### `roll_requested`

- `request_id`, `formula`, `reason`, optional `actor_ref`

### `roll_result`

- `request_id`, `formula`, `rolls`, `total`, `signed`

### `state_patch_requested`

- `request_id`, `reason`, `patches`

### `state_patch_applied`

- `request_id`, `applied`, optional `rejected`

### `entity_created`

- `entity_ref`, `name`, `data`

### `audio_cue`

- `cue`, `intensity`, optional `duration_ms`

### `error_note`

- `message`, optional `context`

## Authority and Security Rules

- Orchestrator proposes; realtime validates and commits.
- Realtime is the only writer of ordered campaign events.
- Production websocket auth requires JWT verification.
- Internal tool execution endpoint must be authenticated (shared secret or mTLS).

## Compatibility Rule

Any contract change requires:

1. updating this file first,
2. updating `packages/shared` schemas/types,
3. explicit migration notes in roadmap.

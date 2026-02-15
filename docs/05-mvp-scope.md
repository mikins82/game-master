# MVP Scope

## Scope Guard

This file is the scope gate for delivery. Any item not listed in "In Scope" is out of v1.

## In Scope (v1)

- Account auth and campaign creation/join.
- Basic character creation and campaign roster.
- Websocket realtime messaging with ordered event batches.
- Authoritative event-sourced turn loop.
- Server-generated/signature-backed dice outcomes.
- Validated state patches for core resources and scene flags.
- Text DM narration with options via orchestrator tool-calling.
- RAG retrieval for rules/lore support.
- Save/resume with snapshot + event replay.

## Out of Scope (v1)

- Multi-edition full rules parity.
- Full VTT-grade tactical map system.
- Continuous speech-to-speech realtime sessions.
- Advanced faction/economy/political simulation.
- Mobile app.

## v1.5 Candidate Additions

- JWT-hardening everywhere (if not already complete in v1).
- Redis pub/sub for horizontally scaled websocket nodes.
- Structured model usage cost tracking and budget controls.
- Optional DM narration TTS pipeline (`dm_audio_ready` event).

## v2 Candidate Additions

- NPC voice profiles at scale.
- Dynamic ambient audio engine.
- Expanded rules packs and content plugins.
- Procedural world systems.

## Acceptance Criteria (v1)

1. Multiplayer session runs for 30+ minutes without event ordering issues.
2. A reconnecting client can recover from `last_seq_seen` with no state mismatch.
3. Dice results are never client-provided.
4. Illegal state patches are rejected with explicit reasons.
5. Narrative remains playable under defined latency and cost budgets.

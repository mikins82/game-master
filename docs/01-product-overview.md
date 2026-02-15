# Product Overview

## Vision

Build a narrative-first tabletop RPG platform where:

- the game server is authoritative for rules and state,
- the LLM provides narration and intent via tool calls,
- players can run persistent campaigns with save/resume and multiplayer sync.

## Core Principles

1. Deterministic engine for legality, dice, and state mutation.
2. LLM does not write state directly.
3. Database is source of truth for campaign state and event history.
4. Retrieval provides contextual lore/rules to reduce hallucination.
5. Contracts are stable across services (API, WS, orchestrator, frontend).

## Product Goals (v1)

- Text-first gameplay with multiplayer.
- Single ruleset: 5e SRD.
- Authoritative dice and state updates.
- Event stream + snapshot resume.
- Basic RAG for campaign lore and rules references.

## Non-Goals (v1)

- Full multi-edition rules engine.
- Continuous real-time speech-to-speech sessions.
- Dynamic economy/faction simulation.
- Deep map tooling beyond minimal scene support.

## Legal and Content Constraints

- Use SRD or licensed content for hosted product features.
- Support user-owned uploads under clear terms.
- Do not distribute copyrighted rulebook text without rights.
- Add safety/content controls for user-generated worlds.

## Feasibility Position

The product is technically feasible. Main risks are integration discipline, contract drift, and scope creep rather than model capability.

## Success Criteria (v1)

- A 2-4 player campaign can be created, joined, played, and resumed.
- Core turn flow is reliable (action -> validation -> events -> narrative).
- Dice and state changes are auditable from the event stream.
- Retrieval improves consistency without breaking latency targets.

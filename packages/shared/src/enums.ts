import { z } from "zod";

// ---------------------------------------------------------------------------
// Patch operations for apply_state_patch
// ---------------------------------------------------------------------------
export const PatchOp = z.enum(["set", "inc", "push", "remove"]);
export type PatchOp = z.infer<typeof PatchOp>;

// ---------------------------------------------------------------------------
// Entity types for create_entity
// ---------------------------------------------------------------------------
export const EntityType = z.enum(["npc", "location"]);
export type EntityType = z.infer<typeof EntityType>;

// ---------------------------------------------------------------------------
// Game modes (snapshot.mode)
// ---------------------------------------------------------------------------
export const GameMode = z.enum(["free", "combat"]);
export type GameMode = z.infer<typeof GameMode>;

// ---------------------------------------------------------------------------
// Intensity levels for trigger_audio
// ---------------------------------------------------------------------------
export const Intensity = z.enum(["low", "mid", "high"]);
export type Intensity = z.infer<typeof Intensity>;

// ---------------------------------------------------------------------------
// Canonical tool names (5)
// ---------------------------------------------------------------------------
export const ToolName = z.enum([
  "roll",
  "apply_state_patch",
  "create_entity",
  "rag_search",
  "trigger_audio",
]);
export type ToolName = z.infer<typeof ToolName>;

// ---------------------------------------------------------------------------
// Canonical event names (9)
// ---------------------------------------------------------------------------
export const EventName = z.enum([
  "player_action",
  "dm_narration",
  "roll_requested",
  "roll_result",
  "state_patch_requested",
  "state_patch_applied",
  "entity_created",
  "audio_cue",
  "error_note",
]);
export type EventName = z.infer<typeof EventName>;

// ---------------------------------------------------------------------------
// WebSocket message types
// ---------------------------------------------------------------------------
export const ClientMessageType = z.enum([
  "client.hello",
  "client.join",
  "client.player_action",
  "client.ack",
  "client.ping",
]);
export type ClientMessageType = z.infer<typeof ClientMessageType>;

export const ServerMessageType = z.enum([
  "server.hello",
  "server.joined",
  "server.events",
  "server.error",
  "server.pong",
]);
export type ServerMessageType = z.infer<typeof ServerMessageType>;

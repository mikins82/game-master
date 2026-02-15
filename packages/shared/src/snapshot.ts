import { z } from "zod";
import { GameMode } from "./enums.js";

// ---------------------------------------------------------------------------
// Turn state (combat mode)
// ---------------------------------------------------------------------------
export const TurnState = z.object({
  round: z.number().int().nonnegative(),
  active_entity_ref: z.string().optional(),
  initiative_order: z.array(z.string()).optional(),
});
export type TurnState = z.infer<typeof TurnState>;

// ---------------------------------------------------------------------------
// Rules flags
// ---------------------------------------------------------------------------
export const RulesFlags = z.object({
  strictness: z.enum(["permissive", "standard", "strict"]).default("standard"),
});
export type RulesFlags = z.infer<typeof RulesFlags>;

// ---------------------------------------------------------------------------
// Game Snapshot
// ---------------------------------------------------------------------------
export const GameSnapshot = z.object({
  campaign_id: z.string().uuid(),
  ruleset: z.string().min(1),
  mode: GameMode,
  location_ref: z.string().optional(),
  scene_summary: z.string().optional(),
  turn_state: TurnState.optional(),
  rules_flags: RulesFlags,
});
export type GameSnapshot = z.infer<typeof GameSnapshot>;

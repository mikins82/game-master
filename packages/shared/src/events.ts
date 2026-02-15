import { z } from "zod";
import { Intensity } from "./enums.js";
import { ActorRef, PatchEntry } from "./tools.js";

// ---------------------------------------------------------------------------
// 1. player_action
// ---------------------------------------------------------------------------
export const PlayerActionPayload = z.object({
  user_id: z.string().uuid(),
  client_msg_id: z.string().uuid(),
  text: z.string().min(1),
  character_id: z.string().uuid().optional(),
});
export type PlayerActionPayload = z.infer<typeof PlayerActionPayload>;

// ---------------------------------------------------------------------------
// 2. dm_narration
// ---------------------------------------------------------------------------
export const DmNarrationPayload = z.object({
  text: z.string().min(1),
  options: z.array(z.string()).optional(),
  scene_refs: z.array(z.string()).optional(),
});
export type DmNarrationPayload = z.infer<typeof DmNarrationPayload>;

// ---------------------------------------------------------------------------
// 3. roll_requested
// ---------------------------------------------------------------------------
export const RollRequestedPayload = z.object({
  request_id: z.string().uuid(),
  formula: z.string().min(1),
  reason: z.string().min(1),
  actor_ref: ActorRef.optional(),
});
export type RollRequestedPayload = z.infer<typeof RollRequestedPayload>;

// ---------------------------------------------------------------------------
// 4. roll_result
// ---------------------------------------------------------------------------
export const RollResultPayload = z.object({
  request_id: z.string().uuid(),
  formula: z.string().min(1),
  rolls: z.array(z.number().int()),
  total: z.number().int(),
  signed: z.string().min(1),
});
export type RollResultPayload = z.infer<typeof RollResultPayload>;

// ---------------------------------------------------------------------------
// 5. state_patch_requested
// ---------------------------------------------------------------------------
export const StatePatchRequestedPayload = z.object({
  request_id: z.string().uuid(),
  reason: z.string().min(1),
  patches: z.array(PatchEntry).min(1),
});
export type StatePatchRequestedPayload = z.infer<
  typeof StatePatchRequestedPayload
>;

// ---------------------------------------------------------------------------
// 6. state_patch_applied
// ---------------------------------------------------------------------------
export const StatePatchAppliedPayload = z.object({
  request_id: z.string().uuid(),
  applied: z.array(PatchEntry),
  rejected: z
    .array(
      z.object({
        patch: PatchEntry,
        reason: z.string(),
      }),
    )
    .optional(),
});
export type StatePatchAppliedPayload = z.infer<typeof StatePatchAppliedPayload>;

// ---------------------------------------------------------------------------
// 7. entity_created
// ---------------------------------------------------------------------------
export const EntityCreatedPayload = z.object({
  entity_ref: z.string().min(1),
  name: z.string().min(1),
  data: z.record(z.unknown()),
});
export type EntityCreatedPayload = z.infer<typeof EntityCreatedPayload>;

// ---------------------------------------------------------------------------
// 8. audio_cue
// ---------------------------------------------------------------------------
export const AudioCuePayload = z.object({
  cue: z.string().min(1),
  intensity: Intensity,
  duration_ms: z.number().int().positive().optional(),
});
export type AudioCuePayload = z.infer<typeof AudioCuePayload>;

// ---------------------------------------------------------------------------
// 9. error_note
// ---------------------------------------------------------------------------
export const ErrorNotePayload = z.object({
  message: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});
export type ErrorNotePayload = z.infer<typeof ErrorNotePayload>;

// ---------------------------------------------------------------------------
// Discriminated game-event union
// ---------------------------------------------------------------------------
export const GameEventPayload = z.discriminatedUnion("event", [
  z.object({ event: z.literal("player_action"), payload: PlayerActionPayload }),
  z.object({ event: z.literal("dm_narration"), payload: DmNarrationPayload }),
  z.object({
    event: z.literal("roll_requested"),
    payload: RollRequestedPayload,
  }),
  z.object({ event: z.literal("roll_result"), payload: RollResultPayload }),
  z.object({
    event: z.literal("state_patch_requested"),
    payload: StatePatchRequestedPayload,
  }),
  z.object({
    event: z.literal("state_patch_applied"),
    payload: StatePatchAppliedPayload,
  }),
  z.object({
    event: z.literal("entity_created"),
    payload: EntityCreatedPayload,
  }),
  z.object({ event: z.literal("audio_cue"), payload: AudioCuePayload }),
  z.object({ event: z.literal("error_note"), payload: ErrorNotePayload }),
]);
export type GameEventPayload = z.infer<typeof GameEventPayload>;

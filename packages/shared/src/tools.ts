import { z } from "zod";
import { EntityType, Intensity, PatchOp } from "./enums.js";

// ---------------------------------------------------------------------------
// Shared reference patterns
// ---------------------------------------------------------------------------

/** Actor reference: `character:<uuid>` | `npc:<uuid>` */
export const ActorRef = z
  .string()
  .regex(
    /^(character|npc):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "Must be character:<uuid> or npc:<uuid>",
  );
export type ActorRef = z.infer<typeof ActorRef>;

/** Patch target: `snapshot` | `character:<uuid>` | `npc:<uuid>` | `location:<uuid>` */
export const PatchTarget = z
  .string()
  .regex(
    /^(snapshot|(character|npc|location):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    'Must be "snapshot" or <entity_type>:<uuid>',
  );
export type PatchTarget = z.infer<typeof PatchTarget>;

/** Entity reference: `npc:<uuid>` | `location:<uuid>` */
export const EntityRef = z
  .string()
  .regex(
    /^(npc|location):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "Must be npc:<uuid> or location:<uuid>",
  );
export type EntityRef = z.infer<typeof EntityRef>;

// ---------------------------------------------------------------------------
// Single patch entry (used by apply_state_patch + events)
// ---------------------------------------------------------------------------
export const PatchEntry = z.object({
  op: PatchOp,
  target: PatchTarget,
  path: z.string().min(1),
  value: z.unknown().optional(),
});
export type PatchEntry = z.infer<typeof PatchEntry>;

// ---------------------------------------------------------------------------
// 1. roll
// ---------------------------------------------------------------------------
export const RollTool = z.object({
  campaign_id: z.string().uuid(),
  formula: z.string().min(1),
  reason: z.string().min(1),
  actor_ref: ActorRef.optional(),
  tags: z.array(z.string()).optional(),
});
export type RollTool = z.infer<typeof RollTool>;

// ---------------------------------------------------------------------------
// 2. apply_state_patch
// ---------------------------------------------------------------------------
export const ApplyStatePatchTool = z.object({
  campaign_id: z.string().uuid(),
  reason: z.string().min(1),
  patches: z.array(PatchEntry).min(1),
});
export type ApplyStatePatchTool = z.infer<typeof ApplyStatePatchTool>;

// ---------------------------------------------------------------------------
// 3. create_entity
// ---------------------------------------------------------------------------
export const CreateEntityTool = z.object({
  campaign_id: z.string().uuid(),
  entity_type: EntityType,
  name: z.string().min(1),
  data: z.record(z.unknown()),
});
export type CreateEntityTool = z.infer<typeof CreateEntityTool>;

// ---------------------------------------------------------------------------
// 4. rag_search
// ---------------------------------------------------------------------------
export const RagSearchTool = z.object({
  query: z.string().min(1),
  campaign_id: z.string().uuid().optional(),
  edition: z.string().optional(),
  k: z.number().int().positive().default(6),
  filters: z.record(z.unknown()).optional(),
});
export type RagSearchTool = z.infer<typeof RagSearchTool>;

// ---------------------------------------------------------------------------
// 5. trigger_audio
// ---------------------------------------------------------------------------
export const TriggerAudioTool = z.object({
  campaign_id: z.string().uuid(),
  cue: z.string().min(1),
  intensity: Intensity.optional(),
  duration_ms: z.number().int().positive().optional(),
});
export type TriggerAudioTool = z.infer<typeof TriggerAudioTool>;

// ---------------------------------------------------------------------------
// Discriminated tool-call union
// ---------------------------------------------------------------------------
export const ToolCall = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("roll"), args: RollTool }),
  z.object({ tool: z.literal("apply_state_patch"), args: ApplyStatePatchTool }),
  z.object({ tool: z.literal("create_entity"), args: CreateEntityTool }),
  z.object({ tool: z.literal("rag_search"), args: RagSearchTool }),
  z.object({ tool: z.literal("trigger_audio"), args: TriggerAudioTool }),
]);
export type ToolCall = z.infer<typeof ToolCall>;

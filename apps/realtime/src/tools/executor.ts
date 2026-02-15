import type { ServerEvent, ToolCall } from "@game-master/shared";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendEvent } from "../engine/event-store.js";
import { broadcastEvents } from "../ws/rooms.js";
import { createEntity } from "./create-entity.js";
import { rollDice } from "./dice.js";
import { applySnapshotPatches, validatePatches } from "./state-patch.js";
import { validateAudioCue } from "./trigger-audio.js";

// ---------------------------------------------------------------------------
// Orchestrator response shape (what we receive from the LLM orchestrator)
// ---------------------------------------------------------------------------

export type OrchestratorResponse = {
  tool_calls: ToolCall[];
  narration: {
    text: string;
    options?: string[];
    scene_refs?: string[];
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute all tool calls returned by the orchestrator, in order.
 * Each tool call produces one or more events that are appended and broadcast.
 * Finally, the DM narration is appended as the last event.
 */
export async function executeToolCalls(
  pool: Pool,
  campaignId: string,
  response: OrchestratorResponse,
): Promise<ServerEvent[]> {
  const allEvents: ServerEvent[] = [];

  // Execute each tool call in order
  for (const call of response.tool_calls) {
    try {
      const events = await executeSingleTool(pool, campaignId, call);
      allEvents.push(...events);
      broadcastEvents(campaignId, events);
    } catch (err) {
      // Tool call failed — append an error_note and continue
      const { event: errorEvent } = await appendEvent(
        pool,
        campaignId,
        "error_note",
        {
          message: `Tool ${call.tool} failed: ${err instanceof Error ? err.message : "unknown error"}`,
          context: { tool: call.tool },
        },
      );
      allEvents.push(errorEvent);
      broadcastEvents(campaignId, [errorEvent]);
    }
  }

  // Append DM narration last
  const { event: narrationEvent } = await appendEvent(
    pool,
    campaignId,
    "dm_narration",
    {
      text: response.narration.text,
      options: response.narration.options,
      scene_refs: response.narration.scene_refs,
    },
  );
  allEvents.push(narrationEvent);
  broadcastEvents(campaignId, [narrationEvent]);

  return allEvents;
}

// ---------------------------------------------------------------------------
// Individual tool executors
// ---------------------------------------------------------------------------

async function executeSingleTool(
  pool: Pool,
  campaignId: string,
  call: ToolCall,
): Promise<ServerEvent[]> {
  switch (call.tool) {
    case "roll":
      return executeRoll(pool, campaignId, call.args);
    case "apply_state_patch":
      return executeStatePatch(pool, campaignId, call.args);
    case "create_entity":
      return executeCreateEntity(pool, campaignId, call.args);
    case "trigger_audio":
      return executeTriggerAudio(pool, campaignId, call.args);
    case "rag_search":
      // rag_search is consumed by the orchestrator, not executed as a state event
      return [];
  }
}

// ---------------------------------------------------------------------------
// roll
// ---------------------------------------------------------------------------

async function executeRoll(
  pool: Pool,
  campaignId: string,
  args: Extract<ToolCall, { tool: "roll" }>["args"],
): Promise<ServerEvent[]> {
  const requestId = randomUUID();

  // roll_requested
  const { event: reqEvent } = await appendEvent(
    pool,
    campaignId,
    "roll_requested",
    {
      request_id: requestId,
      formula: args.formula,
      reason: args.reason,
      actor_ref: args.actor_ref,
    },
  );

  // Execute the roll with server-side RNG
  const result = rollDice(args.formula);

  // roll_result
  const { event: resEvent } = await appendEvent(
    pool,
    campaignId,
    "roll_result",
    {
      request_id: requestId,
      formula: result.formula,
      rolls: result.rolls,
      total: result.total,
      signed: result.signed,
    },
  );

  return [reqEvent, resEvent];
}

// ---------------------------------------------------------------------------
// apply_state_patch
// ---------------------------------------------------------------------------

async function executeStatePatch(
  pool: Pool,
  campaignId: string,
  args: Extract<ToolCall, { tool: "apply_state_patch" }>["args"],
): Promise<ServerEvent[]> {
  const requestId = randomUUID();

  // state_patch_requested
  const { event: reqEvent, snapshot: currentSnapshot } = await appendEvent(
    pool,
    campaignId,
    "state_patch_requested",
    {
      request_id: requestId,
      reason: args.reason,
      patches: args.patches,
    },
  );

  // Validate patches (entity patches applied to DB here)
  const validationResult = await validatePatches(
    pool,
    campaignId,
    currentSnapshot,
    args.patches,
  );

  // Determine which patches target the snapshot
  const snapshotPatches = validationResult.applied.filter(
    (p) => p.target === "snapshot",
  );

  // state_patch_applied — snapshot patches applied inside the transaction
  const { event: appliedEvent } = await appendEvent(
    pool,
    campaignId,
    "state_patch_applied",
    {
      request_id: requestId,
      applied: validationResult.applied,
      rejected:
        validationResult.rejected.length > 0
          ? validationResult.rejected
          : undefined,
    },
    snapshotPatches.length > 0
      ? (snap) => applySnapshotPatches(snap, snapshotPatches)
      : undefined,
  );

  return [reqEvent, appliedEvent];
}

// ---------------------------------------------------------------------------
// create_entity
// ---------------------------------------------------------------------------

async function executeCreateEntity(
  pool: Pool,
  campaignId: string,
  args: Extract<ToolCall, { tool: "create_entity" }>["args"],
): Promise<ServerEvent[]> {
  const result = await createEntity(
    pool,
    campaignId,
    args.entity_type,
    args.name,
    args.data,
  );

  const { event } = await appendEvent(pool, campaignId, "entity_created", {
    entity_ref: result.entityRef,
    name: result.name,
    data: result.data,
  });

  return [event];
}

// ---------------------------------------------------------------------------
// trigger_audio
// ---------------------------------------------------------------------------

async function executeTriggerAudio(
  pool: Pool,
  campaignId: string,
  args: Extract<ToolCall, { tool: "trigger_audio" }>["args"],
): Promise<ServerEvent[]> {
  const result = validateAudioCue(args.cue, args.intensity, args.duration_ms);

  const { event } = await appendEvent(pool, campaignId, "audio_cue", {
    cue: result.cue,
    intensity: result.intensity,
    duration_ms: result.duration_ms,
  });

  return [event];
}

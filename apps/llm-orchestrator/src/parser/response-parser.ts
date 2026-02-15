// ---------------------------------------------------------------------------
// Response parser — validate LLM tool calls against shared Zod schemas
// ---------------------------------------------------------------------------

import {
  ApplyStatePatchTool,
  CreateEntityTool,
  RagSearchTool,
  RollTool,
  TriggerAudioTool,
  type ToolCall,
} from "@game-master/shared";
import type { RawToolCall } from "../llm/openai-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedToolCall {
  tool: ToolCall["tool"];
  args: ToolCall["args"];
}

export interface ParsedResponse {
  narration: string;
  toolCalls: ParsedToolCall[];
  /** Tool calls that failed validation — logged but not returned to realtime */
  invalidToolCalls: Array<{ name: string; raw: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Schema map for validation
// ---------------------------------------------------------------------------

const TOOL_SCHEMAS = {
  roll: RollTool,
  apply_state_patch: ApplyStatePatchTool,
  create_entity: CreateEntityTool,
  rag_search: RagSearchTool,
  trigger_audio: TriggerAudioTool,
} as const;

type ToolName = keyof typeof TOOL_SCHEMAS;

function isValidToolName(name: string): name is ToolName {
  return name in TOOL_SCHEMAS;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse and validate raw LLM tool calls against the shared Zod schemas.
 * Injects `campaign_id` into tool args since the LLM doesn't supply it.
 *
 * Invalid tool calls are collected but excluded from the output.
 * If ALL tool calls are invalid, the response degrades to narration-only.
 */
export function parseResponse(
  narration: string,
  rawToolCalls: RawToolCall[],
  campaignId: string,
): ParsedResponse {
  const parsed: ParsedToolCall[] = [];
  const invalid: ParsedResponse["invalidToolCalls"] = [];

  for (const raw of rawToolCalls) {
    if (!isValidToolName(raw.name)) {
      invalid.push({
        name: raw.name,
        raw: raw.arguments,
        error: `Unknown tool name: ${raw.name}`,
      });
      continue;
    }

    let args: unknown;
    try {
      args = JSON.parse(raw.arguments);
    } catch {
      invalid.push({
        name: raw.name,
        raw: raw.arguments,
        error: "Failed to parse tool arguments as JSON",
      });
      continue;
    }

    // Inject campaign_id for tools that require it
    if (typeof args === "object" && args !== null) {
      const argsObj = args as Record<string, unknown>;
      if (raw.name !== "rag_search") {
        argsObj.campaign_id = campaignId;
      } else if (!argsObj.campaign_id) {
        // rag_search: campaign_id is optional, but set it if not provided
        argsObj.campaign_id = campaignId;
      }
    }

    // Validate against the canonical Zod schema
    const schema = TOOL_SCHEMAS[raw.name];
    const result = schema.safeParse(args);

    if (!result.success) {
      invalid.push({
        name: raw.name,
        raw: raw.arguments,
        error: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      continue;
    }

    parsed.push({
      tool: raw.name as ToolCall["tool"],
      args: result.data as ToolCall["args"],
    });
  }

  // Ensure we always have narration text (never empty)
  const finalNarration =
    (typeof narration === "string" && narration.trim()) ||
    "The Dungeon Master pauses thoughtfully…";

  return {
    narration: finalNarration,
    toolCalls: parsed,
    invalidToolCalls: invalid,
  };
}

/**
 * Build a safe fallback response when the LLM call fails entirely.
 */
export function buildFallbackResponse(errorMessage: string): ParsedResponse {
  return {
    narration:
      "The Dungeon Master takes a moment to gather their thoughts... (Please try your action again.)",
    toolCalls: [],
    invalidToolCalls: [
      {
        name: "_llm_error",
        raw: "",
        error: errorMessage,
      },
    ],
  };
}

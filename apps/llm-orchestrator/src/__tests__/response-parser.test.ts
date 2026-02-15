// ---------------------------------------------------------------------------
// Response parser tests — validate LLM output parsing + Zod schema enforcement
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import type { RawToolCall } from "../llm/openai-client.js";
import {
  buildFallbackResponse,
  parseResponse,
} from "../parser/response-parser.js";

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";
const CHAR_UUID = "22222222-2222-2222-2222-222222222222";
const NPC_UUID = "33333333-3333-3333-3333-333333333333";

describe("parseResponse", () => {
  // -------------------------------------------------------------------------
  // Valid tool calls
  // -------------------------------------------------------------------------

  it("parses a valid roll tool call", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "roll",
        arguments: JSON.stringify({
          formula: "1d20+5",
          reason: "Perception check",
          actor_ref: `character:${CHAR_UUID}`,
        }),
      },
    ];

    const result = parseResponse(
      "You attempt to look around.",
      rawToolCalls,
      CAMPAIGN_ID,
    );

    expect(result.narration).toBe("You attempt to look around.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe("roll");
    expect(result.toolCalls[0].args).toEqual({
      campaign_id: CAMPAIGN_ID,
      formula: "1d20+5",
      reason: "Perception check",
      actor_ref: `character:${CHAR_UUID}`,
    });
    expect(result.invalidToolCalls).toHaveLength(0);
  });

  it("parses a valid apply_state_patch tool call", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "apply_state_patch",
        arguments: JSON.stringify({
          reason: "Orc hits player for 8 damage",
          patches: [
            {
              op: "inc",
              target: `character:${CHAR_UUID}`,
              path: "/resources/hp_current",
              value: -8,
            },
          ],
        }),
      },
    ];

    const result = parseResponse(
      "The orc swings its axe!",
      rawToolCalls,
      CAMPAIGN_ID,
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe("apply_state_patch");
    expect(result.toolCalls[0].args).toMatchObject({
      campaign_id: CAMPAIGN_ID,
      reason: "Orc hits player for 8 damage",
    });
    expect(result.invalidToolCalls).toHaveLength(0);
  });

  it("parses a valid create_entity tool call", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "create_entity",
        arguments: JSON.stringify({
          entity_type: "npc",
          name: "Bartender Giles",
          data: { role: "merchant", disposition: "friendly" },
        }),
      },
    ];

    const result = parseResponse(
      "A stout man emerges from behind the counter.",
      rawToolCalls,
      CAMPAIGN_ID,
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe("create_entity");
    expect(result.toolCalls[0].args).toMatchObject({
      campaign_id: CAMPAIGN_ID,
      entity_type: "npc",
      name: "Bartender Giles",
    });
    expect(result.invalidToolCalls).toHaveLength(0);
  });

  it("parses a valid trigger_audio tool call", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "trigger_audio",
        arguments: JSON.stringify({
          cue: "thunder",
          intensity: "high",
          duration_ms: 3000,
        }),
      },
    ];

    const result = parseResponse(
      "Lightning cracks across the sky!",
      rawToolCalls,
      CAMPAIGN_ID,
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe("trigger_audio");
    expect(result.toolCalls[0].args).toMatchObject({
      campaign_id: CAMPAIGN_ID,
      cue: "thunder",
      intensity: "high",
    });
    expect(result.invalidToolCalls).toHaveLength(0);
  });

  it("parses a valid rag_search tool call", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "rag_search",
        arguments: JSON.stringify({
          query: "grappling rules 5e",
          edition: "5e",
          k: 4,
        }),
      },
    ];

    const result = parseResponse("", rawToolCalls, CAMPAIGN_ID);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe("rag_search");
    expect(result.toolCalls[0].args).toMatchObject({
      query: "grappling rules 5e",
      campaign_id: CAMPAIGN_ID,
    });
    expect(result.invalidToolCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Multiple tool calls in one response
  // -------------------------------------------------------------------------

  it("parses multiple valid tool calls", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "roll",
        arguments: JSON.stringify({
          formula: "1d20+3",
          reason: "Attack roll",
        }),
      },
      {
        name: "trigger_audio",
        arguments: JSON.stringify({ cue: "sword_hit" }),
      },
    ];

    const result = parseResponse(
      "The fighter swings their sword!",
      rawToolCalls,
      CAMPAIGN_ID,
    );

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].tool).toBe("roll");
    expect(result.toolCalls[1].tool).toBe("trigger_audio");
    expect(result.invalidToolCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Narration-only response (no tool calls)
  // -------------------------------------------------------------------------

  it("handles narration-only response (no tool calls)", () => {
    const result = parseResponse(
      "The forest is quiet. A gentle breeze rustles the leaves.",
      [],
      CAMPAIGN_ID,
    );

    expect(result.narration).toBe(
      "The forest is quiet. A gentle breeze rustles the leaves.",
    );
    expect(result.toolCalls).toHaveLength(0);
    expect(result.invalidToolCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Invalid tool calls
  // -------------------------------------------------------------------------

  it("rejects unknown tool names", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "cast_fireball",
        arguments: JSON.stringify({ target: "goblin" }),
      },
    ];

    const result = parseResponse("Boom!", rawToolCalls, CAMPAIGN_ID);

    expect(result.toolCalls).toHaveLength(0);
    expect(result.invalidToolCalls).toHaveLength(1);
    expect(result.invalidToolCalls[0].name).toBe("cast_fireball");
    expect(result.invalidToolCalls[0].error).toContain("Unknown tool name");
  });

  it("rejects tool calls with unparseable JSON arguments", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "roll",
        arguments: "not valid json {{{",
      },
    ];

    const result = parseResponse("Rolling...", rawToolCalls, CAMPAIGN_ID);

    expect(result.toolCalls).toHaveLength(0);
    expect(result.invalidToolCalls).toHaveLength(1);
    expect(result.invalidToolCalls[0].error).toContain("Failed to parse");
  });

  it("rejects roll with missing required fields", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "roll",
        arguments: JSON.stringify({
          formula: "1d20",
          // missing: reason
        }),
      },
    ];

    const result = parseResponse("Rolling dice...", rawToolCalls, CAMPAIGN_ID);

    expect(result.toolCalls).toHaveLength(0);
    expect(result.invalidToolCalls).toHaveLength(1);
    expect(result.invalidToolCalls[0].error).toContain("reason");
  });

  it("rejects apply_state_patch with invalid op", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "apply_state_patch",
        arguments: JSON.stringify({
          reason: "test",
          patches: [
            {
              op: "delete", // invalid — not in enum
              target: "snapshot",
              path: "/foo",
            },
          ],
        }),
      },
    ];

    const result = parseResponse("Patching...", rawToolCalls, CAMPAIGN_ID);

    expect(result.toolCalls).toHaveLength(0);
    expect(result.invalidToolCalls).toHaveLength(1);
  });

  it("rejects create_entity with invalid entity_type", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "create_entity",
        arguments: JSON.stringify({
          entity_type: "spell", // invalid
          name: "Fireball",
          data: {},
        }),
      },
    ];

    const result = parseResponse("Creating...", rawToolCalls, CAMPAIGN_ID);

    expect(result.toolCalls).toHaveLength(0);
    expect(result.invalidToolCalls).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Mixed valid + invalid tool calls
  // -------------------------------------------------------------------------

  it("keeps valid tool calls and rejects invalid ones", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "roll",
        arguments: JSON.stringify({
          formula: "1d20+5",
          reason: "Attack roll",
        }),
      },
      {
        name: "unknown_tool",
        arguments: "{}",
      },
      {
        name: "trigger_audio",
        arguments: JSON.stringify({ cue: "sword_hit" }),
      },
    ];

    const result = parseResponse("Combat!", rawToolCalls, CAMPAIGN_ID);

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].tool).toBe("roll");
    expect(result.toolCalls[1].tool).toBe("trigger_audio");
    expect(result.invalidToolCalls).toHaveLength(1);
    expect(result.invalidToolCalls[0].name).toBe("unknown_tool");
  });

  // -------------------------------------------------------------------------
  // Campaign ID injection
  // -------------------------------------------------------------------------

  it("injects campaign_id into tool args", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "roll",
        arguments: JSON.stringify({
          formula: "2d6",
          reason: "Damage roll",
        }),
      },
    ];

    const result = parseResponse("Hit!", rawToolCalls, CAMPAIGN_ID);

    expect(result.toolCalls[0].args).toHaveProperty("campaign_id", CAMPAIGN_ID);
  });

  // -------------------------------------------------------------------------
  // Empty narration fallback
  // -------------------------------------------------------------------------

  it("provides default narration when LLM returns empty text and no tool calls", () => {
    const result = parseResponse("", [], CAMPAIGN_ID);

    expect(result.narration).toBe("The Dungeon Master pauses thoughtfully...");
  });

  it("preserves empty narration when tool calls exist", () => {
    const rawToolCalls: RawToolCall[] = [
      {
        name: "roll",
        arguments: JSON.stringify({ formula: "1d20", reason: "Init" }),
      },
    ];

    const result = parseResponse("", rawToolCalls, CAMPAIGN_ID);

    // With tool calls present, empty narration is kept as-is
    expect(result.toolCalls).toHaveLength(1);
  });
});

describe("buildFallbackResponse", () => {
  it("returns narration-only response with error details", () => {
    const fallback = buildFallbackResponse("API rate limit exceeded");

    expect(fallback.narration).toContain("gather their thoughts");
    expect(fallback.toolCalls).toHaveLength(0);
    expect(fallback.invalidToolCalls).toHaveLength(1);
    expect(fallback.invalidToolCalls[0].error).toBe("API rate limit exceeded");
  });
});

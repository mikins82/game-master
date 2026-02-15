// ---------------------------------------------------------------------------
// Context builder tests — prompt assembly
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { buildMessages } from "../prompts/context-builder.js";
import type { OrchestrateRequest } from "../routes/orchestrate.js";

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(
  overrides: Partial<OrchestrateRequest> = {},
): OrchestrateRequest {
  return {
    campaign_id: CAMPAIGN_ID,
    player_action: "I kick the door open",
    snapshot: {
      campaign_id: CAMPAIGN_ID,
      ruleset: "5e",
      mode: "free",
      rules_flags: { strictness: "standard" },
    },
    recent_events: [],
    ...overrides,
  };
}

describe("buildMessages", () => {
  it("returns a system message and a user message", () => {
    const messages = buildMessages(makeRequest(), []);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("includes edition in system prompt", () => {
    const messages = buildMessages(makeRequest(), []);

    expect(messages[0].content).toContain("5e");
  });

  it("includes snapshot in user message", () => {
    const messages = buildMessages(makeRequest(), []);

    expect(messages[1].content).toContain("Current Game State");
    expect(messages[1].content).toContain(CAMPAIGN_ID);
  });

  it("includes player action in user message", () => {
    const messages = buildMessages(
      makeRequest({ player_action: "I search the chest" }),
      [],
    );

    expect(messages[1].content).toContain("I search the chest");
  });

  it("includes recent events when present", () => {
    const messages = buildMessages(
      makeRequest({
        recent_events: [
          { event: "player_action", payload: { text: "hello" } },
          { event: "dm_narration", payload: { text: "Welcome!" } },
        ],
      }),
      [],
    );

    expect(messages[1].content).toContain("Recent Events");
    expect(messages[1].content).toContain("hello");
    expect(messages[1].content).toContain("Welcome!");
  });

  it("excludes recent events section when empty", () => {
    const messages = buildMessages(makeRequest({ recent_events: [] }), []);

    expect(messages[1].content).not.toContain("Recent Events");
  });

  it("includes RAG chunks when provided", () => {
    const chunks = [
      {
        content:
          "Grappling: You can use the Attack action to make a special melee attack, a grapple.",
        meta: { source: "SRD", type: "rule", edition: "5e", page: 74 },
        score: 0.92,
      },
    ];

    const messages = buildMessages(makeRequest(), chunks);

    expect(messages[1].content).toContain("Retrieved Rules & Lore");
    expect(messages[1].content).toContain("Grappling");
    expect(messages[1].content).toContain("SRD");
    expect(messages[1].content).toContain("0.920");
  });

  it("excludes RAG section when no chunks available", () => {
    const messages = buildMessages(makeRequest(), []);

    expect(messages[1].content).not.toContain("Retrieved Rules & Lore");
  });

  it("system prompt includes strict DM rules", () => {
    const messages = buildMessages(makeRequest(), []);

    expect(messages[0].content).toContain("roll");
    expect(messages[0].content).toContain("apply_state_patch");
    expect(messages[0].content).toContain("Never invent");
  });
});

// ---------------------------------------------------------------------------
// Integration tests for POST /orchestrate — mocked LLM
// ---------------------------------------------------------------------------

import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrchestratorConfig } from "../config.js";
import type { LlmClient, LlmRawResponse } from "../llm/openai-client.js";
import { registerOrchestrateRoute } from "../routes/orchestrate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";
const CHAR_UUID = "22222222-2222-2222-2222-222222222222";

function makeConfig(
  overrides: Partial<OrchestratorConfig> = {},
): OrchestratorConfig {
  return {
    port: 0,
    host: "127.0.0.1",
    openaiApiKey: "test-key",
    model: "gpt-4o-mini",
    maxRecentEvents: 20,
    maxRagChunks: 6,
    databaseUrl: "",
    internalSecret: "dev-internal-secret",
    logLevel: "silent",
    ...overrides,
  };
}

function makeRequestBody(overrides: Record<string, unknown> = {}) {
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

function makeLlmResponse(
  overrides: Partial<LlmRawResponse> = {},
): LlmRawResponse {
  return {
    narration: "The door splinters open with a crash!",
    toolCalls: [],
    usage: {
      promptTokens: 500,
      completionTokens: 100,
      totalTokens: 600,
    },
    model: "gpt-4o-mini",
    latencyMs: 250,
    ...overrides,
  };
}

function createMockLlmClient(response: LlmRawResponse): LlmClient {
  return {
    call: vi.fn().mockResolvedValue(response),
  } as unknown as LlmClient;
}

function createFailingLlmClient(error: Error): LlmClient {
  return {
    call: vi.fn().mockRejectedValue(error),
  } as unknown as LlmClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /orchestrate", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function buildApp(
    llmClient: LlmClient,
    configOverrides: Partial<OrchestratorConfig> = {},
  ) {
    app = Fastify({ logger: false });
    const config = makeConfig(configOverrides);
    registerOrchestrateRoute(app, config, llmClient, null);
    await app.ready();
    return app;
  }

  // -------------------------------------------------------------------------
  // Happy path: narration only
  // -------------------------------------------------------------------------

  it("returns 200 with narration when LLM returns text only", async () => {
    const client = createMockLlmClient(makeLlmResponse());
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.narration).toBe("The door splinters open with a crash!");
    expect(body.tool_calls).toEqual([]);
    expect(body.usage).toBeDefined();
    expect(body.usage.model).toBe("gpt-4o-mini");
    expect(body.usage.prompt_tokens).toBe(500);
    expect(body.usage.completion_tokens).toBe(100);
    expect(body.usage.latency_ms).toBe(250);
  });

  // -------------------------------------------------------------------------
  // Happy path: valid tool calls
  // -------------------------------------------------------------------------

  it("returns valid roll + apply_state_patch tool calls", async () => {
    const llmResponse = makeLlmResponse({
      narration: "The orc attacks!",
      toolCalls: [
        {
          name: "roll",
          arguments: JSON.stringify({
            formula: "1d20+5",
            reason: "Attack roll",
            actor_ref: `npc:${CHAR_UUID}`,
          }),
        },
        {
          name: "apply_state_patch",
          arguments: JSON.stringify({
            reason: "Orc hits for 8 damage",
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
      ],
    });

    const client = createMockLlmClient(llmResponse);
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.narration).toBe("The orc attacks!");
    expect(body.tool_calls).toHaveLength(2);
    expect(body.tool_calls[0].tool).toBe("roll");
    expect(body.tool_calls[0].args.campaign_id).toBe(CAMPAIGN_ID);
    expect(body.tool_calls[0].args.formula).toBe("1d20+5");
    expect(body.tool_calls[1].tool).toBe("apply_state_patch");
    expect(body.tool_calls[1].args.campaign_id).toBe(CAMPAIGN_ID);
  });

  it("returns valid create_entity tool call", async () => {
    const llmResponse = makeLlmResponse({
      narration: "A mysterious figure steps out of the shadows.",
      toolCalls: [
        {
          name: "create_entity",
          arguments: JSON.stringify({
            entity_type: "npc",
            name: "Shadow Thief",
            data: { role: "antagonist", disposition: "hostile" },
          }),
        },
      ],
    });

    const client = createMockLlmClient(llmResponse);
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tool_calls).toHaveLength(1);
    expect(body.tool_calls[0].tool).toBe("create_entity");
    expect(body.tool_calls[0].args.name).toBe("Shadow Thief");
    expect(body.tool_calls[0].args.entity_type).toBe("npc");
  });

  it("returns valid trigger_audio tool call", async () => {
    const llmResponse = makeLlmResponse({
      narration: "Thunder rumbles across the dark sky.",
      toolCalls: [
        {
          name: "trigger_audio",
          arguments: JSON.stringify({
            cue: "thunder",
            intensity: "high",
          }),
        },
      ],
    });

    const client = createMockLlmClient(llmResponse);
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tool_calls).toHaveLength(1);
    expect(body.tool_calls[0].tool).toBe("trigger_audio");
    expect(body.tool_calls[0].args.cue).toBe("thunder");
  });

  // -------------------------------------------------------------------------
  // Invalid model output → fallback
  // -------------------------------------------------------------------------

  it("filters out invalid tool calls but keeps valid ones", async () => {
    const llmResponse = makeLlmResponse({
      narration: "Things happen.",
      toolCalls: [
        {
          name: "roll",
          arguments: JSON.stringify({
            formula: "1d20",
            reason: "Stealth check",
          }),
        },
        {
          name: "fake_tool",
          arguments: "{}",
        },
      ],
    });

    const client = createMockLlmClient(llmResponse);
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tool_calls).toHaveLength(1);
    expect(body.tool_calls[0].tool).toBe("roll");
  });

  it("returns narration-only fallback when LLM returns garbage tool calls", async () => {
    const llmResponse = makeLlmResponse({
      narration: "The DM narrates.",
      toolCalls: [
        {
          name: "nonexistent",
          arguments: "not json",
        },
        {
          name: "roll",
          arguments: JSON.stringify({ formula: "1d20" }), // missing reason
        },
      ],
    });

    const client = createMockLlmClient(llmResponse);
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.narration).toBe("The DM narrates.");
    expect(body.tool_calls).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // LLM call failure → fallback
  // -------------------------------------------------------------------------

  it("returns fallback response when LLM call throws", async () => {
    const client = createFailingLlmClient(
      new Error("OpenAI API rate limit exceeded"),
    );
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.narration).toContain("gather their thoughts");
    expect(body.tool_calls).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Request validation
  // -------------------------------------------------------------------------

  it("returns 400 for missing campaign_id", async () => {
    const client = createMockLlmClient(makeLlmResponse());
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: {
        player_action: "test",
        snapshot: {
          campaign_id: CAMPAIGN_ID,
          ruleset: "5e",
          mode: "free",
          rules_flags: { strictness: "standard" },
        },
        recent_events: [],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 for invalid snapshot", async () => {
    const client = createMockLlmClient(makeLlmResponse());
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: {
        campaign_id: CAMPAIGN_ID,
        player_action: "test",
        snapshot: { invalid: true },
        recent_events: [],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for empty player_action", async () => {
    const client = createMockLlmClient(makeLlmResponse());
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody({ player_action: "" }),
    });

    expect(res.statusCode).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Usage/cost logging
  // -------------------------------------------------------------------------

  it("includes usage data in response", async () => {
    const client = createMockLlmClient(
      makeLlmResponse({
        usage: {
          promptTokens: 1200,
          completionTokens: 300,
          totalTokens: 1500,
        },
        latencyMs: 450,
      }),
    );
    await buildApp(client);

    const res = await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.usage).toBeDefined();
    expect(body.usage.prompt_tokens).toBe(1200);
    expect(body.usage.completion_tokens).toBe(300);
    expect(body.usage.total_tokens).toBe(1500);
    expect(body.usage.latency_ms).toBe(450);
  });

  // -------------------------------------------------------------------------
  // LLM client receives correct messages
  // -------------------------------------------------------------------------

  it("calls LLM with properly assembled messages", async () => {
    const callFn = vi.fn().mockResolvedValue(makeLlmResponse());
    const client = { call: callFn } as unknown as LlmClient;
    await buildApp(client);

    await app.inject({
      method: "POST",
      url: "/orchestrate",
      payload: makeRequestBody({ player_action: "I search the room" }),
    });

    expect(callFn).toHaveBeenCalledOnce();
    const messages = callFn.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("I search the room");
    expect(messages[0].content).toContain("5e");
  });
});

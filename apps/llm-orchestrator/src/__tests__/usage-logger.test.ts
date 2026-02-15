// ---------------------------------------------------------------------------
// Usage logger tests
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import { logUsage } from "../logger/usage-logger.js";

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: "info",
  } as any;
}

describe("logUsage", () => {
  it("returns a structured usage entry", () => {
    const logger = createMockLogger();

    const entry = logUsage(logger, {
      campaignId: CAMPAIGN_ID,
      model: "gpt-4o-mini",
      promptTokens: 500,
      completionTokens: 100,
      totalTokens: 600,
      latencyMs: 250,
      toolCallCount: 2,
      invalidToolCallCount: 0,
    });

    expect(entry.campaignId).toBe(CAMPAIGN_ID);
    expect(entry.model).toBe("gpt-4o-mini");
    expect(entry.promptTokens).toBe(500);
    expect(entry.completionTokens).toBe(100);
    expect(entry.totalTokens).toBe(600);
    expect(entry.latencyMs).toBe(250);
    expect(entry.toolCallCount).toBe(2);
    expect(entry.invalidToolCallCount).toBe(0);
    expect(entry.timestamp).toBeTruthy();
  });

  it("logs the entry via the logger", () => {
    const logger = createMockLogger();

    logUsage(logger, {
      campaignId: CAMPAIGN_ID,
      model: "gpt-4o-mini",
      promptTokens: 500,
      completionTokens: 100,
      totalTokens: 600,
      latencyMs: 250,
      toolCallCount: 1,
      invalidToolCallCount: 0,
    });

    expect(logger.info).toHaveBeenCalledOnce();
    const [logObj, msg] = logger.info.mock.calls[0];
    expect(logObj.usage).toBeDefined();
    expect(msg).toBe("llm_usage");
  });

  it("estimates cost for gpt-4o-mini", () => {
    const logger = createMockLogger();

    const entry = logUsage(logger, {
      campaignId: CAMPAIGN_ID,
      model: "gpt-4o-mini",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      latencyMs: 1000,
      toolCallCount: 0,
      invalidToolCallCount: 0,
    });

    // gpt-4o-mini: $0.15/1M input + $0.60/1M output = $0.75
    expect(entry.estimatedCostUsd).toBeCloseTo(0.75, 2);
  });

  it("uses default pricing for unknown models", () => {
    const logger = createMockLogger();

    const entry = logUsage(logger, {
      campaignId: CAMPAIGN_ID,
      model: "some-future-model",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      latencyMs: 1000,
      toolCallCount: 0,
      invalidToolCallCount: 0,
    });

    // Default pricing: $1.0/1M input + $3.0/1M output = $4.0
    expect(entry.estimatedCostUsd).toBeCloseTo(4.0, 2);
  });

  it("records invalid tool call count", () => {
    const logger = createMockLogger();

    const entry = logUsage(logger, {
      campaignId: CAMPAIGN_ID,
      model: "gpt-4o-mini",
      promptTokens: 500,
      completionTokens: 100,
      totalTokens: 600,
      latencyMs: 250,
      toolCallCount: 1,
      invalidToolCallCount: 3,
    });

    expect(entry.invalidToolCallCount).toBe(3);
  });
});

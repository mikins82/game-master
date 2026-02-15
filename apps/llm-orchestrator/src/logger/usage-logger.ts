// ---------------------------------------------------------------------------
// Token/cost usage logger
// ---------------------------------------------------------------------------

import type { FastifyBaseLogger } from "fastify";

// ---------------------------------------------------------------------------
// Pricing table (per 1M tokens, USD)
// ---------------------------------------------------------------------------

const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-2024-11-20": { input: 2.5, output: 10.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
};

const DEFAULT_PRICING = { input: 1.0, output: 3.0 }; // conservative fallback

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageEntry {
  campaignId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  toolCallCount: number;
  invalidToolCallCount: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = PRICING[model] ?? DEFAULT_PRICING;
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 10000) / 10000; // 4 decimal places
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/**
 * Log structured token usage and cost information for a single orchestration call.
 * Uses Fastify's pino logger for structured JSON output.
 */
export function logUsage(
  logger: FastifyBaseLogger,
  params: {
    campaignId: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    toolCallCount: number;
    invalidToolCallCount: number;
  },
): UsageEntry {
  const entry: UsageEntry = {
    campaignId: params.campaignId,
    model: params.model,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens: params.totalTokens,
    estimatedCostUsd: estimateCost(
      params.model,
      params.promptTokens,
      params.completionTokens,
    ),
    latencyMs: params.latencyMs,
    toolCallCount: params.toolCallCount,
    invalidToolCallCount: params.invalidToolCallCount,
    timestamp: new Date().toISOString(),
  };

  logger.info({ usage: entry }, "llm_usage");

  return entry;
}

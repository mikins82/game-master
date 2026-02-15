// ---------------------------------------------------------------------------
// POST /orchestrate — the single entry point called by apps/realtime
// ---------------------------------------------------------------------------

import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { GameSnapshot } from '@game-master/shared';
import { buildMessages } from '../prompts/context-builder.js';
import { LlmClient } from '../llm/openai-client.js';
import { retrieveChunks } from '../rag/retrieval.js';
import {
  parseResponse,
  buildFallbackResponse,
} from '../parser/response-parser.js';
import { logUsage } from '../logger/usage-logger.js';
import type { OrchestratorConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Simple per-campaign rate limiter for model calls (30 req / min)
// ---------------------------------------------------------------------------

const campaignTimestamps = new Map<string, number[]>();
const MODEL_RATE_LIMIT = 30;
const MODEL_RATE_WINDOW_MS = 60_000;

function checkModelRateLimit(campaignId: string): boolean {
  const now = Date.now();
  const cutoff = now - MODEL_RATE_WINDOW_MS;

  let ts = campaignTimestamps.get(campaignId) ?? [];
  ts = ts.filter((t) => t > cutoff);

  if (ts.length >= MODEL_RATE_LIMIT) {
    campaignTimestamps.set(campaignId, ts);
    return false;
  }

  ts.push(now);
  campaignTimestamps.set(campaignId, ts);
  return true;
}

// Periodic cleanup
setInterval(() => {
  const cutoff = Date.now() - MODEL_RATE_WINDOW_MS;
  for (const [key, ts] of campaignTimestamps) {
    const filtered = ts.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      campaignTimestamps.delete(key);
    } else {
      campaignTimestamps.set(key, filtered);
    }
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Request / Response schemas
// ---------------------------------------------------------------------------

export const OrchestrateRequestSchema = z.object({
  campaign_id: z.string().uuid(),
  player_action: z.object({
    user_id: z.string(),
    text: z.string().min(1),
  }),
  snapshot: GameSnapshot,
  recent_events: z.array(z.unknown()),
});

export type OrchestrateRequest = z.infer<typeof OrchestrateRequestSchema>;

export const OrchestrateResponseSchema = z.object({
  narration: z.object({
    text: z.string(),
    options: z.array(z.string()).optional(),
    scene_refs: z.array(z.string()).optional(),
  }),
  tool_calls: z.array(
    z.object({
      tool: z.string(),
      args: z.record(z.unknown()),
    }),
  ),
  usage: z
    .object({
      model: z.string(),
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
      estimated_cost_usd: z.number(),
      latency_ms: z.number(),
    })
    .optional(),
});

export type OrchestrateResponse = z.infer<typeof OrchestrateResponseSchema>;

// ---------------------------------------------------------------------------
// Embedding helper — calls OpenAI embeddings API for RAG queries
// ---------------------------------------------------------------------------

async function getEmbedding(
  llmClient: LlmClient,
  text: string,
  apiKey: string,
): Promise<number[]> {
  // Use OpenAI embeddings API directly for the RAG query
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey });
  const result = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return result.data[0].embedding;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerOrchestrateRoute(
  app: FastifyInstance,
  config: OrchestratorConfig,
  llmClient: LlmClient,
  pool: pg.Pool | null,
) {
  app.post(
    '/orchestrate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Validate request body
      const parseResult = OrchestrateRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: parseResult.error.issues,
        });
      }

      const req = parseResult.data;

      // 2. Verify internal service auth
      // In production (INTERNAL_SECRET != dev default), the header is required.
      const authHeader = request.headers['x-internal-secret'] as
        | string
        | undefined;
      if (
        config.internalSecret &&
        config.internalSecret !== 'dev-internal-secret'
      ) {
        if (!authHeader || authHeader !== config.internalSecret) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }
      }

      // 2b. Rate-limit model calls per campaign
      if (!checkModelRateLimit(req.campaign_id)) {
        return reply.status(429).send({
          error: 'Too Many Requests',
          message: 'Model call rate limit exceeded for this campaign',
          retryAfter: 60,
        });
      }

      // 3. Retrieve RAG chunks (if DB is available)
      let ragChunks: Awaited<ReturnType<typeof retrieveChunks>> = [];
      if (pool && config.openaiApiKey) {
        try {
          const queryEmbedding = await getEmbedding(
            llmClient,
            req.player_action.text,
            config.openaiApiKey,
          );
          ragChunks = await retrieveChunks(pool, {
            queryEmbedding,
            campaignId: req.campaign_id,
            k: config.maxRagChunks,
          });
        } catch (err) {
          request.log.warn({ err }, 'RAG retrieval failed; continuing without context');
        }
      }

      // 4. Assemble LLM messages
      const messages = buildMessages(req, ragChunks);

      // 5. Call LLM
      let parsed;
      try {
        const rawResponse = await llmClient.call(messages);

        // 6. Parse and validate response
        parsed = parseResponse(
          rawResponse.narration,
          rawResponse.toolCalls,
          req.campaign_id,
        );

        // 7. Log usage
        logUsage(request.log, {
          campaignId: req.campaign_id,
          model: rawResponse.model,
          promptTokens: rawResponse.usage.promptTokens,
          completionTokens: rawResponse.usage.completionTokens,
          totalTokens: rawResponse.usage.totalTokens,
          latencyMs: rawResponse.latencyMs,
          toolCallCount: parsed.toolCalls.length,
          invalidToolCallCount: parsed.invalidToolCalls.length,
        });

        // Log invalid tool calls for debugging
        if (parsed.invalidToolCalls.length > 0) {
          request.log.warn(
            { invalidToolCalls: parsed.invalidToolCalls },
            'Some LLM tool calls failed validation',
          );
        }

        // 8. Build response (ensure narration.text is never empty)
        const narrationText =
          (typeof parsed.narration === 'string' && parsed.narration.trim()) ||
          'The Dungeon Master pauses thoughtfully…';
        const response: OrchestrateResponse = {
          narration: { text: narrationText },
          tool_calls: parsed.toolCalls.map((tc) => ({
            tool: tc.tool,
            args: tc.args as unknown as Record<string, unknown>,
          })),
          usage: {
            model: rawResponse.model,
            prompt_tokens: rawResponse.usage.promptTokens,
            completion_tokens: rawResponse.usage.completionTokens,
            total_tokens: rawResponse.usage.totalTokens,
            estimated_cost_usd: 0, // filled in by logUsage already
            latency_ms: rawResponse.latencyMs,
          },
        };

        return reply.status(200).send(response);
      } catch (err) {
        // LLM call failed — return fallback
        request.log.error({ err }, 'LLM call failed; returning fallback');

        const fallback = buildFallbackResponse(
          err instanceof Error ? err.message : 'Unknown LLM error',
        );

        const response: OrchestrateResponse = {
          narration: { text: fallback.narration },
          tool_calls: [],
        };

        return reply.status(200).send(response);
      }
    },
  );
}

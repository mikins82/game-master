// ---------------------------------------------------------------------------
// OpenAI LLM client — tool-calling mode
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LlmMessage } from "../prompts/context-builder.js";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawToolCall {
  name: string;
  arguments: string; // raw JSON string from the model
}

export interface LlmRawResponse {
  narration: string;
  toolCalls: RawToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class LlmClient {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  /**
   * Send the assembled messages to the LLM in tool-calling mode.
   * Returns the raw response with narration text, tool calls, and usage stats.
   */
  async call(messages: LlmMessage[]): Promise<LlmRawResponse> {
    const startMs = Date.now();

    const openaiMessages: ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
      temperature: 0.8,
      max_tokens: 2048,
    });

    const latencyMs = Date.now() - startMs;
    const choice = completion.choices[0];
    const message = choice?.message;

    // Extract narration text (content)
    const narration = message?.content ?? "";

    // Extract tool calls
    const toolCalls: RawToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    // Usage stats
    const usage = {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    };

    return {
      narration,
      toolCalls,
      usage,
      model: completion.model,
      latencyMs,
    };
  }
}

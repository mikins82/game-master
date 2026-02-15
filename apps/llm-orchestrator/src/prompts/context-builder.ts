// ---------------------------------------------------------------------------
// Context assembly — builds the full messages array for the LLM call
// ---------------------------------------------------------------------------

import type { OrchestrateRequest } from "../routes/orchestrate.js";
import { buildSystemPrompt } from "./system-prompt.js";

export interface RagChunk {
  content: string;
  meta: Record<string, unknown>;
  score: number;
}

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Assemble the message array to send to the LLM.
 *
 * Structure:
 *   [0] system — DM role + rules + tool policy
 *   [1] user   — runtime context (snapshot, events, RAG, player action)
 */
export function buildMessages(
  request: OrchestrateRequest,
  ragChunks: RagChunk[],
): LlmMessage[] {
  const edition = request.snapshot.ruleset ?? "5e";
  const system = buildSystemPrompt(edition);

  const runtimeParts: string[] = [];

  // Snapshot
  runtimeParts.push(
    "## Current Game State (Snapshot)\n" +
      JSON.stringify(request.snapshot, null, 2),
  );

  // Recent events
  if (request.recent_events.length > 0) {
    runtimeParts.push(
      "## Recent Events (newest last)\n" +
        request.recent_events
          .map(
            (e, i) =>
              `[${i + 1}] ${typeof e === "object" ? JSON.stringify(e) : String(e)}`,
          )
          .join("\n"),
    );
  }

  // RAG context
  if (ragChunks.length > 0) {
    const chunksText = ragChunks
      .map((c, i) => {
        const metaStr = Object.entries(c.meta)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        return `[Chunk ${i + 1} | ${metaStr} | score=${c.score.toFixed(3)}]\n${c.content}`;
      })
      .join("\n\n");
    runtimeParts.push("## Retrieved Rules & Lore\n" + chunksText);
  }

  // Player action
  runtimeParts.push(`## Player Action\n"${request.player_action.text}"`);

  return [
    { role: "system", content: system },
    { role: "user", content: runtimeParts.join("\n\n") },
  ];
}

import type { GameSnapshot, ServerEvent } from '@game-master/shared';
import type { OrchestratorResponse } from '../tools/executor.js';
import { env } from '../env.js';

/**
 * Call the LLM orchestrator service with the current game context.
 *
 * Sends:  snapshot + player action + recent events
 * Returns: tool call proposals + DM narration
 *
 * Falls back to a narration-only response if the orchestrator is unreachable.
 */
export async function callOrchestrator(
  campaignId: string,
  snapshot: GameSnapshot,
  playerAction: { user_id: string; text: string },
  recentEvents: ServerEvent[],
): Promise<OrchestratorResponse> {
  const url = `${env.ORCHESTRATOR_URL}/orchestrate`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': env.INTERNAL_SECRET,
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        snapshot,
        player_action: playerAction,
        recent_events: recentEvents,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Orchestrator returned ${res.status}: ${await res.text()}`,
      );
    }

    const data = (await res.json()) as Record<string, unknown>;

    // Normalize narration: accept { text, options? } or legacy string
    const rawNarration = data.narration;
    let narration: { text: string; options?: string[]; scene_refs?: string[] };
    if (typeof rawNarration === 'string') {
      narration = {
        text: rawNarration.trim() || 'The Dungeon Master pauses thoughtfully…',
        options: ['Continue'],
      };
    } else if (rawNarration && typeof rawNarration === 'object' && 'text' in rawNarration && typeof (rawNarration as { text: unknown }).text === 'string') {
      const obj = rawNarration as { text: string; options?: string[]; scene_refs?: string[] };
      narration = {
        text: obj.text.trim() || 'The Dungeon Master pauses thoughtfully…',
        options: obj.options,
        scene_refs: obj.scene_refs,
      };
    } else {
      throw new Error('Orchestrator response missing valid narration');
    }

    const tool_calls = Array.isArray(data.tool_calls) ? data.tool_calls : [];
    return { tool_calls, narration } as OrchestratorResponse;
  } catch (err) {
    // Fallback: narration-only response so the game loop doesn't stall
    console.error('[orchestrator] Call failed, using fallback:', err);
    return {
      tool_calls: [],
      narration: {
        text: 'The Dungeon Master pauses to gather their thoughts… (orchestrator unavailable)',
        options: ['Wait patiently', 'Try a different action'],
      },
    };
  }
}

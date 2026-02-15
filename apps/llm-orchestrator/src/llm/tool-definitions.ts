// ---------------------------------------------------------------------------
// OpenAI tool definitions — maps canonical tools to OpenAI function-calling format
// ---------------------------------------------------------------------------

import type { ChatCompletionTool } from "openai/resources/chat/completions";

/**
 * The 5 canonical tools expressed in OpenAI function-calling format.
 *
 * The LLM will propose these; the game server (realtime) validates and executes.
 * Note: campaign_id is injected by the orchestrator — the LLM does NOT need to
 * supply it. We include it in the schema so the response parser can add it.
 */
export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "roll",
      description:
        "Roll dice using the game rules. The server generates the actual random result. You must use this for ALL dice rolls — never invent outcomes.",
      parameters: {
        type: "object",
        properties: {
          formula: {
            type: "string",
            description: 'Dice formula, e.g. "1d20+5", "2d6+3", "1d8"',
          },
          reason: {
            type: "string",
            description:
              'Why this roll is happening, e.g. "Perception check", "Longsword attack"',
          },
          actor_ref: {
            type: "string",
            description:
              'The entity rolling: "character:<uuid>" or "npc:<uuid>". Optional.',
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              'Optional tags for categorizing the roll, e.g. ["attack", "melee"]',
          },
        },
        required: ["formula", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_state_patch",
      description:
        "Request an atomic state change. The server validates legality before applying. Use for HP changes, condition updates, inventory modifications, location transitions, etc.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Why this state change is happening",
          },
          patches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: {
                  type: "string",
                  enum: ["set", "inc", "push", "remove"],
                  description: "The patch operation",
                },
                target: {
                  type: "string",
                  description:
                    '"snapshot" or "character:<uuid>" or "npc:<uuid>" or "location:<uuid>"',
                },
                path: {
                  type: "string",
                  description:
                    'JSON-pointer-style path, e.g. "/resources/hp_current"',
                },
                value: {
                  description:
                    "The value for the operation (required for set, inc, push)",
                },
              },
              required: ["op", "target", "path"],
            },
            description: "Array of patch operations to apply atomically",
          },
        },
        required: ["reason", "patches"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_entity",
      description:
        "Create a new NPC or location in the game world. Use when introducing new characters or discovering new places.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["npc", "location"],
            description: "Type of entity to create",
          },
          name: {
            type: "string",
            description: "Name of the NPC or location",
          },
          data: {
            type: "object",
            description:
              "Structured data for the entity (role, disposition, stats for NPCs; description, tags for locations)",
          },
        },
        required: ["entity_type", "name", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_search",
      description:
        "Search rules and lore knowledge base. Use when you need to look up specific game rules, spell descriptions, monster stats, or campaign lore.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language search query",
          },
          edition: {
            type: "string",
            description: 'Edition filter, e.g. "5e"',
          },
          k: {
            type: "integer",
            description: "Number of chunks to retrieve (default 6)",
          },
          filters: {
            type: "object",
            description:
              'Metadata filters, e.g. {"type": "rule"} or {"source": "SRD"}',
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trigger_audio",
      description:
        "Trigger a sound effect or ambient audio cue for players. Use to enhance immersion during combat, exploration, or dramatic moments.",
      parameters: {
        type: "object",
        properties: {
          cue: {
            type: "string",
            description:
              'Sound cue identifier, e.g. "sword_hit", "tavern_ambience", "thunder", "dragon_roar"',
          },
          intensity: {
            type: "string",
            enum: ["low", "mid", "high"],
            description: 'Intensity level (default "mid")',
          },
          duration_ms: {
            type: "integer",
            description: "Duration in milliseconds (default 1200)",
          },
        },
        required: ["cue"],
      },
    },
  },
];

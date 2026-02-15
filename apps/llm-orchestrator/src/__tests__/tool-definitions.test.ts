// ---------------------------------------------------------------------------
// Tool definitions tests — ensure all 5 canonical tools are defined
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "../llm/tool-definitions.js";

describe("TOOL_DEFINITIONS", () => {
  const toolNames = TOOL_DEFINITIONS.map((t) => t.function.name);

  it("defines exactly 5 canonical tools", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(5);
  });

  it("includes the roll tool", () => {
    expect(toolNames).toContain("roll");
  });

  it("includes the apply_state_patch tool", () => {
    expect(toolNames).toContain("apply_state_patch");
  });

  it("includes the create_entity tool", () => {
    expect(toolNames).toContain("create_entity");
  });

  it("includes the rag_search tool", () => {
    expect(toolNames).toContain("rag_search");
  });

  it("includes the trigger_audio tool", () => {
    expect(toolNames).toContain("trigger_audio");
  });

  it("does not include any deprecated tool names", () => {
    const deprecated = [
      "roll_dice",
      "apply_damage",
      "create_npc",
      "update_quest",
      "change_location",
      "trigger_sound",
    ];
    for (const name of deprecated) {
      expect(toolNames).not.toContain(name);
    }
  });

  it('all tools are type "function"', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.type).toBe("function");
    }
  });

  it("roll requires formula and reason", () => {
    const roll = TOOL_DEFINITIONS.find((t) => t.function.name === "roll")!;
    expect(roll.function.parameters?.required).toContain("formula");
    expect(roll.function.parameters?.required).toContain("reason");
  });

  it("apply_state_patch requires reason and patches", () => {
    const patch = TOOL_DEFINITIONS.find(
      (t) => t.function.name === "apply_state_patch",
    )!;
    expect(patch.function.parameters?.required).toContain("reason");
    expect(patch.function.parameters?.required).toContain("patches");
  });

  it("create_entity requires entity_type, name, and data", () => {
    const create = TOOL_DEFINITIONS.find(
      (t) => t.function.name === "create_entity",
    )!;
    expect(create.function.parameters?.required).toContain("entity_type");
    expect(create.function.parameters?.required).toContain("name");
    expect(create.function.parameters?.required).toContain("data");
  });

  it("rag_search requires query", () => {
    const rag = TOOL_DEFINITIONS.find((t) => t.function.name === "rag_search")!;
    expect(rag.function.parameters?.required).toContain("query");
  });

  it("trigger_audio requires cue", () => {
    const audio = TOOL_DEFINITIONS.find(
      (t) => t.function.name === "trigger_audio",
    )!;
    expect(audio.function.parameters?.required).toContain("cue");
  });
});

import { describe, expect, it } from "vitest";
import {
  ActorRef,
  ApplyStatePatchTool,
  CreateEntityTool,
  EntityRef,
  PatchEntry,
  PatchTarget,
  RagSearchTool,
  RollTool,
  ToolCall,
  TriggerAudioTool,
} from "../tools.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const CAMPAIGN_ID = "661e8400-e29b-41d4-a716-446655440001";

// ---------------------------------------------------------------------------
// Shared references
// ---------------------------------------------------------------------------

describe("ActorRef", () => {
  it("accepts character:<uuid>", () => {
    expect(ActorRef.parse(`character:${UUID}`)).toBe(`character:${UUID}`);
  });

  it("accepts npc:<uuid>", () => {
    expect(ActorRef.parse(`npc:${UUID}`)).toBe(`npc:${UUID}`);
  });

  it("rejects location:<uuid>", () => {
    expect(() => ActorRef.parse(`location:${UUID}`)).toThrow();
  });

  it("rejects bare uuid", () => {
    expect(() => ActorRef.parse(UUID)).toThrow();
  });

  it("rejects malformed uuid", () => {
    expect(() => ActorRef.parse("character:not-a-uuid")).toThrow();
  });
});

describe("PatchTarget", () => {
  it('accepts "snapshot"', () => {
    expect(PatchTarget.parse("snapshot")).toBe("snapshot");
  });

  it.each(["character", "npc", "location"])("accepts %s:<uuid>", (prefix) => {
    const val = `${prefix}:${UUID}`;
    expect(PatchTarget.parse(val)).toBe(val);
  });

  it("rejects bare uuid", () => {
    expect(() => PatchTarget.parse(UUID)).toThrow();
  });
});

describe("EntityRef", () => {
  it("accepts npc:<uuid>", () => {
    expect(EntityRef.parse(`npc:${UUID}`)).toBe(`npc:${UUID}`);
  });

  it("accepts location:<uuid>", () => {
    expect(EntityRef.parse(`location:${UUID}`)).toBe(`location:${UUID}`);
  });

  it("rejects character:<uuid>", () => {
    expect(() => EntityRef.parse(`character:${UUID}`)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PatchEntry
// ---------------------------------------------------------------------------

describe("PatchEntry", () => {
  it("round-trips a valid entry", () => {
    const entry = {
      op: "set" as const,
      target: "snapshot",
      path: "/mode",
      value: "combat",
    };
    expect(PatchEntry.parse(entry)).toEqual(entry);
  });

  it("allows missing value for remove op", () => {
    const entry = {
      op: "remove" as const,
      target: `npc:${UUID}`,
      path: "/temp_hp",
    };
    expect(PatchEntry.parse(entry)).toMatchObject({
      op: "remove",
      path: "/temp_hp",
    });
  });

  it("rejects empty path", () => {
    expect(() =>
      PatchEntry.parse({ op: "set", target: "snapshot", path: "", value: 1 }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RollTool
// ---------------------------------------------------------------------------

describe("RollTool", () => {
  const valid = {
    campaign_id: CAMPAIGN_ID,
    formula: "2d6+3",
    reason: "Attack roll",
  };

  it("round-trips required fields", () => {
    expect(RollTool.parse(valid)).toEqual(valid);
  });

  it("accepts optional actor_ref and tags", () => {
    const full = {
      ...valid,
      actor_ref: `character:${UUID}`,
      tags: ["attack", "melee"],
    };
    expect(RollTool.parse(full)).toEqual(full);
  });

  it("rejects missing formula", () => {
    expect(() =>
      RollTool.parse({ campaign_id: CAMPAIGN_ID, reason: "roll" }),
    ).toThrow();
  });

  it("rejects invalid campaign_id", () => {
    expect(() =>
      RollTool.parse({ ...valid, campaign_id: "not-uuid" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ApplyStatePatchTool
// ---------------------------------------------------------------------------

describe("ApplyStatePatchTool", () => {
  const patch = {
    op: "set" as const,
    target: "snapshot",
    path: "/mode",
    value: "combat",
  };
  const valid = {
    campaign_id: CAMPAIGN_ID,
    reason: "Enter combat",
    patches: [patch],
  };

  it("round-trips valid input", () => {
    expect(ApplyStatePatchTool.parse(valid)).toEqual(valid);
  });

  it("rejects empty patches array", () => {
    expect(() =>
      ApplyStatePatchTool.parse({ ...valid, patches: [] }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CreateEntityTool
// ---------------------------------------------------------------------------

describe("CreateEntityTool", () => {
  const valid = {
    campaign_id: CAMPAIGN_ID,
    entity_type: "npc" as const,
    name: "Goblin Scout",
    data: { hp: 7, ac: 15 },
  };

  it("round-trips valid input", () => {
    expect(CreateEntityTool.parse(valid)).toEqual(valid);
  });

  it("accepts location entity_type", () => {
    expect(
      CreateEntityTool.parse({ ...valid, entity_type: "location" }),
    ).toBeDefined();
  });

  it("rejects unknown entity_type", () => {
    expect(() =>
      CreateEntityTool.parse({ ...valid, entity_type: "item" }),
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => CreateEntityTool.parse({ ...valid, name: "" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RagSearchTool
// ---------------------------------------------------------------------------

describe("RagSearchTool", () => {
  it("round-trips required fields with default k", () => {
    const result = RagSearchTool.parse({ query: "fireball spell" });
    expect(result.query).toBe("fireball spell");
    expect(result.k).toBe(6);
  });

  it("accepts all optional fields", () => {
    const full = {
      query: "rules for grappling",
      campaign_id: CAMPAIGN_ID,
      edition: "5e",
      k: 10,
      filters: { type: "rules" },
    };
    expect(RagSearchTool.parse(full)).toEqual(full);
  });

  it("rejects empty query", () => {
    expect(() => RagSearchTool.parse({ query: "" })).toThrow();
  });

  it("rejects negative k", () => {
    expect(() => RagSearchTool.parse({ query: "test", k: -1 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TriggerAudioTool
// ---------------------------------------------------------------------------

describe("TriggerAudioTool", () => {
  const valid = { campaign_id: CAMPAIGN_ID, cue: "battle_start" };

  it("round-trips required fields", () => {
    expect(TriggerAudioTool.parse(valid)).toEqual(valid);
  });

  it("accepts optional intensity and duration_ms", () => {
    const full = { ...valid, intensity: "high" as const, duration_ms: 5000 };
    expect(TriggerAudioTool.parse(full)).toEqual(full);
  });

  it("rejects invalid intensity", () => {
    expect(() =>
      TriggerAudioTool.parse({ ...valid, intensity: "max" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ToolCall discriminated union
// ---------------------------------------------------------------------------

describe("ToolCall", () => {
  it("parses a roll tool call", () => {
    const tc = {
      tool: "roll" as const,
      args: { campaign_id: CAMPAIGN_ID, formula: "1d20", reason: "Initiative" },
    };
    expect(ToolCall.parse(tc)).toEqual(tc);
  });

  it("parses an apply_state_patch tool call", () => {
    const tc = {
      tool: "apply_state_patch" as const,
      args: {
        campaign_id: CAMPAIGN_ID,
        reason: "Heal",
        patches: [
          {
            op: "inc" as const,
            target: `character:${UUID}`,
            path: "/hp",
            value: 5,
          },
        ],
      },
    };
    expect(ToolCall.parse(tc)).toEqual(tc);
  });

  it("rejects unknown tool name", () => {
    expect(() =>
      ToolCall.parse({
        tool: "unknown_tool",
        args: { campaign_id: CAMPAIGN_ID },
      }),
    ).toThrow();
  });
});

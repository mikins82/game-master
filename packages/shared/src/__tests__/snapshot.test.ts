import { describe, expect, it } from "vitest";
import { GameSnapshot, RulesFlags, TurnState } from "../snapshot.js";

const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("TurnState", () => {
  it("round-trips valid turn state", () => {
    const val = {
      round: 3,
      active_entity_ref: "character:550e8400-e29b-41d4-a716-446655440000",
    };
    expect(TurnState.parse(val)).toEqual(val);
  });

  it("accepts round 0", () => {
    expect(TurnState.parse({ round: 0 })).toEqual({ round: 0 });
  });

  it("rejects negative round", () => {
    expect(() => TurnState.parse({ round: -1 })).toThrow();
  });

  it("accepts initiative_order", () => {
    const val = { round: 1, initiative_order: ["char:a", "npc:b"] };
    expect(TurnState.parse(val)).toEqual(val);
  });
});

describe("RulesFlags", () => {
  it("defaults strictness to standard", () => {
    const result = RulesFlags.parse({});
    expect(result.strictness).toBe("standard");
  });

  it.each(["permissive", "standard", "strict"])(
    'accepts strictness "%s"',
    (val) => {
      expect(RulesFlags.parse({ strictness: val }).strictness).toBe(val);
    },
  );

  it("rejects invalid strictness", () => {
    expect(() => RulesFlags.parse({ strictness: "casual" })).toThrow();
  });
});

describe("GameSnapshot", () => {
  const minimal = {
    campaign_id: CAMPAIGN_ID,
    ruleset: "dnd5e",
    mode: "free" as const,
    rules_flags: {},
  };

  it("round-trips minimal snapshot (with default strictness)", () => {
    const result = GameSnapshot.parse(minimal);
    expect(result.campaign_id).toBe(CAMPAIGN_ID);
    expect(result.ruleset).toBe("dnd5e");
    expect(result.mode).toBe("free");
    expect(result.rules_flags.strictness).toBe("standard");
  });

  it("round-trips full snapshot", () => {
    const full = {
      campaign_id: CAMPAIGN_ID,
      ruleset: "dnd5e",
      mode: "combat" as const,
      location_ref: "location:550e8400-e29b-41d4-a716-446655440000",
      scene_summary: "The party faces a dragon in a volcanic cavern.",
      turn_state: {
        round: 2,
        active_entity_ref: "character:550e8400-e29b-41d4-a716-446655440000",
        initiative_order: ["character:550e8400-e29b-41d4-a716-446655440000"],
      },
      rules_flags: { strictness: "strict" as const },
    };
    expect(GameSnapshot.parse(full)).toEqual(full);
  });

  it("rejects invalid mode", () => {
    expect(() =>
      GameSnapshot.parse({ ...minimal, mode: "exploration" }),
    ).toThrow();
  });

  it("rejects missing campaign_id", () => {
    const { campaign_id: _, ...rest } = minimal;
    expect(() => GameSnapshot.parse(rest)).toThrow();
  });

  it("rejects missing ruleset", () => {
    const { ruleset: _, ...rest } = minimal;
    expect(() => GameSnapshot.parse(rest)).toThrow();
  });

  it("rejects invalid campaign_id format", () => {
    expect(() =>
      GameSnapshot.parse({ ...minimal, campaign_id: "not-a-uuid" }),
    ).toThrow();
  });
});

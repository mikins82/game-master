import type { GameSnapshot, PatchEntry } from "@game-master/shared";
import { describe, expect, it } from "vitest";
import { applySnapshotPatches } from "../tools/state-patch.js";

const baseSnapshot: GameSnapshot = {
  campaign_id: "00000000-0000-0000-0000-000000000001",
  ruleset: "5e",
  mode: "free",
  rules_flags: { strictness: "standard" },
  scene_summary: "The party rests at camp.",
};

describe("applySnapshotPatches", () => {
  // -----------------------------------------------------------------------
  // set
  // -----------------------------------------------------------------------

  it("set — top-level field", () => {
    const patches: PatchEntry[] = [
      {
        op: "set",
        target: "snapshot",
        path: "/mode",
        value: "combat",
      },
    ];
    const result = applySnapshotPatches(baseSnapshot, patches);
    expect(result.mode).toBe("combat");
    // Original unchanged
    expect(baseSnapshot.mode).toBe("free");
  });

  it("set — nested field (auto-creates intermediate objects)", () => {
    const patches: PatchEntry[] = [
      {
        op: "set",
        target: "snapshot",
        path: "/turn_state/round",
        value: 3,
      },
    ];
    const result = applySnapshotPatches(baseSnapshot, patches);
    expect((result as Record<string, unknown>).turn_state).toBeDefined();
    expect(
      (
        (result as Record<string, unknown>).turn_state as Record<
          string,
          unknown
        >
      ).round,
    ).toBe(3);
  });

  // -----------------------------------------------------------------------
  // inc
  // -----------------------------------------------------------------------

  it("inc — increments a numeric field", () => {
    const snap = {
      ...baseSnapshot,
      turn_state: {
        round: 2,
        active_entity_ref: undefined,
        initiative_order: undefined,
      },
    };
    const patches: PatchEntry[] = [
      {
        op: "inc",
        target: "snapshot",
        path: "/turn_state/round",
        value: 1,
      },
    ];
    const result = applySnapshotPatches(snap, patches);
    expect(
      (
        (result as Record<string, unknown>).turn_state as Record<
          string,
          unknown
        >
      ).round,
    ).toBe(3);
  });

  it("inc — throws on non-number target", () => {
    const patches: PatchEntry[] = [
      {
        op: "inc",
        target: "snapshot",
        path: "/mode",
        value: 1,
      },
    ];
    expect(() => applySnapshotPatches(baseSnapshot, patches)).toThrow(
      "Cannot inc non-number",
    );
  });

  it("inc — throws on non-number value", () => {
    const snap = {
      ...baseSnapshot,
      turn_state: {
        round: 2,
        active_entity_ref: undefined,
        initiative_order: undefined,
      },
    };
    const patches: PatchEntry[] = [
      {
        op: "inc",
        target: "snapshot",
        path: "/turn_state/round",
        value: "oops" as unknown,
      },
    ];
    expect(() => applySnapshotPatches(snap, patches)).toThrow(
      "Inc value must be a number",
    );
  });

  // -----------------------------------------------------------------------
  // push
  // -----------------------------------------------------------------------

  it("push — appends to an array", () => {
    const snap = {
      ...baseSnapshot,
      turn_state: {
        round: 1,
        active_entity_ref: undefined,
        initiative_order: ["character:aaa"],
      },
    };
    const patches: PatchEntry[] = [
      {
        op: "push",
        target: "snapshot",
        path: "/turn_state/initiative_order",
        value: "npc:bbb",
      },
    ];
    const result = applySnapshotPatches(snap, patches);
    const ts = (result as Record<string, unknown>).turn_state as Record<
      string,
      unknown
    >;
    expect(ts.initiative_order).toEqual(["character:aaa", "npc:bbb"]);
  });

  it("push — throws when target is not an array", () => {
    const patches: PatchEntry[] = [
      {
        op: "push",
        target: "snapshot",
        path: "/mode",
        value: "foo",
      },
    ];
    expect(() => applySnapshotPatches(baseSnapshot, patches)).toThrow(
      "Cannot push to non-array",
    );
  });

  // -----------------------------------------------------------------------
  // remove
  // -----------------------------------------------------------------------

  it("remove — deletes a field from object", () => {
    const patches: PatchEntry[] = [
      {
        op: "remove",
        target: "snapshot",
        path: "/scene_summary",
      },
    ];
    const result = applySnapshotPatches(baseSnapshot, patches);
    expect((result as Record<string, unknown>).scene_summary).toBeUndefined();
  });

  it("remove — throws when removing root", () => {
    const patches: PatchEntry[] = [
      {
        op: "remove",
        target: "snapshot",
        path: "",
      },
    ];
    // Path becomes empty array after split, which is length 0
    expect(() => applySnapshotPatches(baseSnapshot, patches)).toThrow();
  });

  // -----------------------------------------------------------------------
  // Multiple patches in sequence
  // -----------------------------------------------------------------------

  it("applies multiple patches in order", () => {
    const patches: PatchEntry[] = [
      { op: "set", target: "snapshot", path: "/mode", value: "combat" },
      {
        op: "set",
        target: "snapshot",
        path: "/scene_summary",
        value: "Goblins attack!",
      },
    ];
    const result = applySnapshotPatches(baseSnapshot, patches);
    expect(result.mode).toBe("combat");
    expect(result.scene_summary).toBe("Goblins attack!");
  });

  // -----------------------------------------------------------------------
  // Ignores non-snapshot patches
  // -----------------------------------------------------------------------

  it("ignores patches targeting entities", () => {
    const patches: PatchEntry[] = [
      {
        op: "set",
        target:
          "character:00000000-0000-0000-0000-000000000001" as PatchEntry["target"],
        path: "/data/hp",
        value: 42,
      },
    ];
    const result = applySnapshotPatches(baseSnapshot, patches);
    // Snapshot should be unchanged
    expect(result).toEqual(baseSnapshot);
  });
});

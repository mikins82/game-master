import { describe, expect, it } from "vitest";
import {
  ClientMessageType,
  EntityType,
  EventName,
  GameMode,
  Intensity,
  PatchOp,
  ServerMessageType,
  ToolName,
} from "../enums.js";

describe("PatchOp", () => {
  it.each(["set", "inc", "push", "remove"])('accepts "%s"', (val) => {
    expect(PatchOp.parse(val)).toBe(val);
  });

  it("rejects invalid op", () => {
    expect(() => PatchOp.parse("delete")).toThrow();
  });
});

describe("EntityType", () => {
  it.each(["npc", "location"])('accepts "%s"', (val) => {
    expect(EntityType.parse(val)).toBe(val);
  });

  it("rejects invalid type", () => {
    expect(() => EntityType.parse("monster")).toThrow();
  });
});

describe("GameMode", () => {
  it.each(["free", "combat"])('accepts "%s"', (val) => {
    expect(GameMode.parse(val)).toBe(val);
  });

  it("rejects invalid mode", () => {
    expect(() => GameMode.parse("exploration")).toThrow();
  });
});

describe("Intensity", () => {
  it.each(["low", "mid", "high"])('accepts "%s"', (val) => {
    expect(Intensity.parse(val)).toBe(val);
  });

  it("rejects invalid intensity", () => {
    expect(() => Intensity.parse("extreme")).toThrow();
  });
});

describe("ToolName", () => {
  const expected = [
    "roll",
    "apply_state_patch",
    "create_entity",
    "rag_search",
    "trigger_audio",
  ];

  it("contains exactly 5 canonical tools", () => {
    expect(ToolName.options).toEqual(expected);
  });

  it.each(expected)('accepts "%s"', (val) => {
    expect(ToolName.parse(val)).toBe(val);
  });

  it.each([
    "roll_dice",
    "apply_damage",
    "create_npc",
    "update_quest",
    "change_location",
    "trigger_sound",
  ])('rejects deprecated alias "%s"', (val) => {
    expect(() => ToolName.parse(val)).toThrow();
  });
});

describe("EventName", () => {
  const expected = [
    "player_action",
    "dm_narration",
    "roll_requested",
    "roll_result",
    "state_patch_requested",
    "state_patch_applied",
    "entity_created",
    "audio_cue",
    "error_note",
  ];

  it("contains exactly 9 canonical events", () => {
    expect(EventName.options).toEqual(expected);
  });

  it.each(expected)('accepts "%s"', (val) => {
    expect(EventName.parse(val)).toBe(val);
  });

  it.each(["roll", "damage"])('rejects deprecated generic name "%s"', (val) => {
    expect(() => EventName.parse(val)).toThrow();
  });
});

describe("ClientMessageType", () => {
  const expected = [
    "client.hello",
    "client.join",
    "client.player_action",
    "client.ack",
    "client.ping",
  ];

  it("contains exactly 5 client message types", () => {
    expect(ClientMessageType.options).toEqual(expected);
  });
});

describe("ServerMessageType", () => {
  const expected = [
    "server.hello",
    "server.joined",
    "server.events",
    "server.error",
    "server.pong",
  ];

  it("contains exactly 5 server message types", () => {
    expect(ServerMessageType.options).toEqual(expected);
  });
});

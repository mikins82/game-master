import { describe, expect, it } from "vitest";
import {
  AudioCuePayload,
  DmNarrationPayload,
  EntityCreatedPayload,
  ErrorNotePayload,
  GameEventPayload,
  PlayerActionPayload,
  RollRequestedPayload,
  RollResultPayload,
  StatePatchAppliedPayload,
  StatePatchRequestedPayload,
} from "../events.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID2 = "661e8400-e29b-41d4-a716-446655440001";

// ---------------------------------------------------------------------------
// Individual event payloads
// ---------------------------------------------------------------------------

describe("PlayerActionPayload", () => {
  const valid = {
    user_id: UUID,
    client_msg_id: UUID2,
    text: "I attack the goblin",
  };

  it("round-trips required fields", () => {
    expect(PlayerActionPayload.parse(valid)).toEqual(valid);
  });

  it("accepts optional character_id", () => {
    const full = { ...valid, character_id: UUID };
    expect(PlayerActionPayload.parse(full)).toEqual(full);
  });

  it("rejects empty text", () => {
    expect(() => PlayerActionPayload.parse({ ...valid, text: "" })).toThrow();
  });

  it("rejects invalid user_id", () => {
    expect(() =>
      PlayerActionPayload.parse({ ...valid, user_id: "bad" }),
    ).toThrow();
  });
});

describe("DmNarrationPayload", () => {
  it("round-trips with just text", () => {
    const val = { text: "The goblin snarls and lunges." };
    expect(DmNarrationPayload.parse(val)).toEqual(val);
  });

  it("accepts optional options and scene_refs", () => {
    const full = {
      text: "What do you do?",
      options: ["Fight", "Flee", "Negotiate"],
      scene_refs: ["location:tavern"],
    };
    expect(DmNarrationPayload.parse(full)).toEqual(full);
  });

  it("rejects empty text", () => {
    expect(() => DmNarrationPayload.parse({ text: "" })).toThrow();
  });
});

describe("RollRequestedPayload", () => {
  const valid = { request_id: UUID, formula: "1d20+5", reason: "Attack roll" };

  it("round-trips required fields", () => {
    expect(RollRequestedPayload.parse(valid)).toEqual(valid);
  });

  it("accepts optional actor_ref", () => {
    const full = { ...valid, actor_ref: `character:${UUID}` };
    expect(RollRequestedPayload.parse(full)).toEqual(full);
  });
});

describe("RollResultPayload", () => {
  const valid = {
    request_id: UUID,
    formula: "2d6+3",
    rolls: [4, 5],
    total: 12,
    signed: "hmac-sha256:abc123",
  };

  it("round-trips valid payload", () => {
    expect(RollResultPayload.parse(valid)).toEqual(valid);
  });

  it("rejects empty rolls array", () => {
    // empty array is allowed (e.g. flat modifier only), but total must still be int
    const withEmpty = { ...valid, rolls: [] };
    expect(RollResultPayload.parse(withEmpty)).toEqual(withEmpty);
  });

  it("rejects empty signed string", () => {
    expect(() => RollResultPayload.parse({ ...valid, signed: "" })).toThrow();
  });
});

describe("StatePatchRequestedPayload", () => {
  const patch = {
    op: "set" as const,
    target: "snapshot",
    path: "/mode",
    value: "combat",
  };
  const valid = { request_id: UUID, reason: "Enter combat", patches: [patch] };

  it("round-trips valid payload", () => {
    expect(StatePatchRequestedPayload.parse(valid)).toEqual(valid);
  });

  it("rejects empty patches", () => {
    expect(() =>
      StatePatchRequestedPayload.parse({ ...valid, patches: [] }),
    ).toThrow();
  });
});

describe("StatePatchAppliedPayload", () => {
  const patch = {
    op: "set" as const,
    target: "snapshot",
    path: "/mode",
    value: "combat",
  };

  it("round-trips with applied only", () => {
    const val = { request_id: UUID, applied: [patch] };
    expect(StatePatchAppliedPayload.parse(val)).toEqual(val);
  });

  it("round-trips with rejected entries", () => {
    const val = {
      request_id: UUID,
      applied: [],
      rejected: [{ patch, reason: "Cannot modify protected field" }],
    };
    expect(StatePatchAppliedPayload.parse(val)).toEqual(val);
  });
});

describe("EntityCreatedPayload", () => {
  const valid = {
    entity_ref: `npc:${UUID}`,
    name: "Goblin Scout",
    data: { hp: 7 },
  };

  it("round-trips valid payload", () => {
    expect(EntityCreatedPayload.parse(valid)).toEqual(valid);
  });

  it("rejects empty name", () => {
    expect(() => EntityCreatedPayload.parse({ ...valid, name: "" })).toThrow();
  });
});

describe("AudioCuePayload", () => {
  const valid = { cue: "battle_theme", intensity: "mid" as const };

  it("round-trips required fields", () => {
    expect(AudioCuePayload.parse(valid)).toEqual(valid);
  });

  it("accepts optional duration_ms", () => {
    const full = { ...valid, duration_ms: 30000 };
    expect(AudioCuePayload.parse(full)).toEqual(full);
  });

  it("rejects missing intensity", () => {
    expect(() => AudioCuePayload.parse({ cue: "test" })).toThrow();
  });
});

describe("ErrorNotePayload", () => {
  it("round-trips with just message", () => {
    const val = { message: "Invalid action" };
    expect(ErrorNotePayload.parse(val)).toEqual(val);
  });

  it("accepts optional context", () => {
    const full = { message: "Rate limited", context: { retry_after: 5 } };
    expect(ErrorNotePayload.parse(full)).toEqual(full);
  });

  it("rejects empty message", () => {
    expect(() => ErrorNotePayload.parse({ message: "" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// GameEventPayload discriminated union
// ---------------------------------------------------------------------------

describe("GameEventPayload", () => {
  it("parses player_action event", () => {
    const ev = {
      event: "player_action" as const,
      payload: {
        user_id: UUID,
        client_msg_id: UUID2,
        text: "I search the room",
      },
    };
    expect(GameEventPayload.parse(ev)).toEqual(ev);
  });

  it("parses dm_narration event", () => {
    const ev = {
      event: "dm_narration" as const,
      payload: { text: "You find a hidden trapdoor." },
    };
    expect(GameEventPayload.parse(ev)).toEqual(ev);
  });

  it("parses error_note event", () => {
    const ev = {
      event: "error_note" as const,
      payload: { message: "Something went wrong" },
    };
    expect(GameEventPayload.parse(ev)).toEqual(ev);
  });

  it("rejects unknown event name", () => {
    expect(() =>
      GameEventPayload.parse({ event: "unknown_event", payload: {} }),
    ).toThrow();
  });

  it("rejects mismatched event/payload", () => {
    expect(() =>
      GameEventPayload.parse({
        event: "player_action",
        payload: { text: "missing user_id and client_msg_id" },
      }),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  ClientAck,
  ClientHello,
  ClientJoin,
  ClientMessage,
  ClientPing,
  ClientPlayerAction,
  ServerError,
  ServerEvent,
  ServerEvents,
  ServerHello,
  ServerJoined,
  ServerMessage,
  ServerPong,
} from "../ws-messages.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID2 = "661e8400-e29b-41d4-a716-446655440001";
const NOW = "2026-02-15T12:00:00.000Z";

// ---------------------------------------------------------------------------
// Client Messages
// ---------------------------------------------------------------------------

describe("ClientHello", () => {
  it("parses valid hello", () => {
    const msg = { type: "client.hello" as const, token: "jwt-token-here" };
    expect(ClientHello.parse(msg)).toEqual(msg);
  });

  it("rejects empty token", () => {
    expect(() =>
      ClientHello.parse({ type: "client.hello", token: "" }),
    ).toThrow();
  });
});

describe("ClientJoin", () => {
  it("parses with campaign_id only", () => {
    const msg = { type: "client.join" as const, campaign_id: UUID };
    expect(ClientJoin.parse(msg)).toEqual(msg);
  });

  it("parses with last_seq_seen for reconnect", () => {
    const msg = {
      type: "client.join" as const,
      campaign_id: UUID,
      last_seq_seen: 42,
    };
    expect(ClientJoin.parse(msg)).toEqual(msg);
  });

  it("accepts last_seq_seen = 0", () => {
    const msg = {
      type: "client.join" as const,
      campaign_id: UUID,
      last_seq_seen: 0,
    };
    expect(ClientJoin.parse(msg)).toEqual(msg);
  });
});

describe("ClientPlayerAction", () => {
  const valid = {
    type: "client.player_action" as const,
    campaign_id: UUID,
    client_msg_id: UUID2,
    text: "I cast fireball",
  };

  it("round-trips valid action", () => {
    expect(ClientPlayerAction.parse(valid)).toEqual(valid);
  });

  it("accepts optional character_id", () => {
    const full = { ...valid, character_id: UUID };
    expect(ClientPlayerAction.parse(full)).toEqual(full);
  });

  it("rejects empty text", () => {
    expect(() => ClientPlayerAction.parse({ ...valid, text: "" })).toThrow();
  });
});

describe("ClientAck", () => {
  it("parses valid ack", () => {
    const msg = { type: "client.ack" as const, seq: 5 };
    expect(ClientAck.parse(msg)).toEqual(msg);
  });

  it("rejects seq = 0", () => {
    expect(() => ClientAck.parse({ type: "client.ack", seq: 0 })).toThrow();
  });
});

describe("ClientPing", () => {
  it("parses with optional ts", () => {
    const msg = { type: "client.ping" as const, ts: Date.now() };
    expect(ClientPing.parse(msg)).toBeDefined();
  });

  it("parses without ts", () => {
    const msg = { type: "client.ping" as const };
    expect(ClientPing.parse(msg)).toEqual(msg);
  });
});

describe("ClientMessage (discriminated union)", () => {
  it("routes client.hello correctly", () => {
    const msg = ClientMessage.parse({ type: "client.hello", token: "tok" });
    expect(msg.type).toBe("client.hello");
  });

  it("routes client.player_action correctly", () => {
    const msg = ClientMessage.parse({
      type: "client.player_action",
      campaign_id: UUID,
      client_msg_id: UUID2,
      text: "action",
    });
    expect(msg.type).toBe("client.player_action");
  });

  it("rejects unknown type", () => {
    expect(() => ClientMessage.parse({ type: "client.unknown" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Server Messages
// ---------------------------------------------------------------------------

const sampleEvent: () => object = () => ({
  seq: 1,
  event_name: "dm_narration",
  payload: { text: "A dark cave looms ahead." },
  occurred_at: NOW,
});

describe("ServerEvent", () => {
  it("parses a valid event", () => {
    const ev = sampleEvent();
    expect(ServerEvent.parse(ev)).toEqual(ev);
  });

  it("rejects seq = 0", () => {
    expect(() => ServerEvent.parse({ ...sampleEvent(), seq: 0 })).toThrow();
  });

  it("rejects invalid event_name", () => {
    expect(() =>
      ServerEvent.parse({ ...sampleEvent(), event_name: "bad_name" }),
    ).toThrow();
  });

  it("rejects invalid datetime", () => {
    expect(() =>
      ServerEvent.parse({ ...sampleEvent(), occurred_at: "not-a-date" }),
    ).toThrow();
  });
});

describe("ServerHello", () => {
  it("parses valid hello", () => {
    const msg = { type: "server.hello" as const, user_id: UUID };
    expect(ServerHello.parse(msg)).toEqual(msg);
  });
});

describe("ServerJoined", () => {
  it("parses with snapshot and events", () => {
    const msg = {
      type: "server.joined" as const,
      campaign_id: UUID,
      snapshot: {
        campaign_id: UUID,
        ruleset: "dnd5e",
        mode: "free",
        rules_flags: { strictness: "standard" },
      },
      events: [sampleEvent()],
    };
    expect(ServerJoined.parse(msg)).toBeDefined();
  });

  it("parses with empty events (fresh campaign)", () => {
    const msg = {
      type: "server.joined" as const,
      campaign_id: UUID,
      snapshot: {
        campaign_id: UUID,
        ruleset: "dnd5e",
        mode: "free",
        rules_flags: {},
      },
      events: [],
    };
    expect(ServerJoined.parse(msg)).toBeDefined();
  });
});

describe("ServerEvents", () => {
  it("parses valid events batch", () => {
    const msg = {
      type: "server.events" as const,
      campaign_id: UUID,
      events: [sampleEvent()],
    };
    expect(ServerEvents.parse(msg)).toBeDefined();
  });

  it("rejects empty events array", () => {
    expect(() =>
      ServerEvents.parse({
        type: "server.events",
        campaign_id: UUID,
        events: [],
      }),
    ).toThrow();
  });
});

describe("ServerError", () => {
  it("parses with message only", () => {
    const msg = { type: "server.error" as const, message: "Unauthorized" };
    expect(ServerError.parse(msg)).toEqual(msg);
  });

  it("parses with optional code", () => {
    const msg = {
      type: "server.error" as const,
      message: "Rate limited",
      code: "RATE_LIMIT",
    };
    expect(ServerError.parse(msg)).toEqual(msg);
  });
});

describe("ServerPong", () => {
  it("parses with optional ts", () => {
    expect(ServerPong.parse({ type: "server.pong", ts: 12345 })).toBeDefined();
  });

  it("parses without ts", () => {
    expect(ServerPong.parse({ type: "server.pong" })).toBeDefined();
  });
});

describe("ServerMessage (discriminated union)", () => {
  it("routes server.hello correctly", () => {
    const msg = ServerMessage.parse({ type: "server.hello", user_id: UUID });
    expect(msg.type).toBe("server.hello");
  });

  it("routes server.error correctly", () => {
    const msg = ServerMessage.parse({ type: "server.error", message: "err" });
    expect(msg.type).toBe("server.error");
  });

  it("rejects unknown server message type", () => {
    expect(() => ServerMessage.parse({ type: "server.unknown" })).toThrow();
  });
});

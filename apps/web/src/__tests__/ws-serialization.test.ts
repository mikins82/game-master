import {
  ClientAck,
  ClientHello,
  ClientJoin,
  ClientMessage,
  ClientPing,
  ClientPlayerAction,
  ServerError,
  ServerEvents,
  ServerHello,
  ServerJoined,
  ServerMessage,
  ServerPong,
} from "@game-master/shared";
import { describe, expect, it } from "vitest";

// ── Client message serialization ────────────────────────────────────────────

describe("Client message serialization", () => {
  it("validates client.hello", () => {
    const msg = { type: "client.hello" as const, token: "abc123" };
    expect(ClientHello.parse(msg)).toEqual(msg);
  });

  it("rejects client.hello with empty token", () => {
    expect(() =>
      ClientHello.parse({ type: "client.hello", token: "" }),
    ).toThrow();
  });

  it("validates client.join", () => {
    const msg = {
      type: "client.join" as const,
      campaign_id: "550e8400-e29b-41d4-a716-446655440000",
      last_seq_seen: 42,
    };
    expect(ClientJoin.parse(msg)).toEqual(msg);
  });

  it("validates client.join without last_seq_seen", () => {
    const msg = {
      type: "client.join" as const,
      campaign_id: "550e8400-e29b-41d4-a716-446655440000",
    };
    expect(ClientJoin.parse(msg)).toEqual(msg);
  });

  it("validates client.player_action", () => {
    const msg = {
      type: "client.player_action" as const,
      campaign_id: "550e8400-e29b-41d4-a716-446655440000",
      client_msg_id: "550e8400-e29b-41d4-a716-446655440001",
      text: "I cast fireball",
    };
    expect(ClientPlayerAction.parse(msg)).toEqual(msg);
  });

  it("validates client.ack", () => {
    const msg = { type: "client.ack" as const, seq: 10 };
    expect(ClientAck.parse(msg)).toEqual(msg);
  });

  it("validates client.ping", () => {
    const msg = { type: "client.ping" as const, ts: Date.now() };
    expect(ClientPing.parse(msg)).toEqual(msg);
  });

  it("parses discriminated ClientMessage union", () => {
    const hello: ClientMessage = ClientMessage.parse({
      type: "client.hello",
      token: "tok",
    });
    expect(hello.type).toBe("client.hello");

    const join: ClientMessage = ClientMessage.parse({
      type: "client.join",
      campaign_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(join.type).toBe("client.join");
  });
});

// ── Server message serialization ────────────────────────────────────────────

describe("Server message serialization", () => {
  it("validates server.hello", () => {
    const msg = {
      type: "server.hello" as const,
      user_id: "550e8400-e29b-41d4-a716-446655440000",
    };
    expect(ServerHello.parse(msg)).toEqual(msg);
  });

  it("validates server.joined with snapshot and events", () => {
    const msg = {
      type: "server.joined" as const,
      campaign_id: "550e8400-e29b-41d4-a716-446655440000",
      snapshot: {
        campaign_id: "550e8400-e29b-41d4-a716-446655440000",
        ruleset: "5e",
        mode: "free" as const,
        rules_flags: { strictness: "standard" as const },
      },
      events: [
        {
          seq: 1,
          event_name: "dm_narration" as const,
          payload: { text: "Welcome." },
          occurred_at: "2025-01-01T00:00:00Z",
        },
      ],
    };
    const parsed = ServerJoined.parse(msg);
    expect(parsed.snapshot.ruleset).toBe("5e");
    expect(parsed.events).toHaveLength(1);
  });

  it("validates server.events", () => {
    const msg = {
      type: "server.events" as const,
      campaign_id: "550e8400-e29b-41d4-a716-446655440000",
      events: [
        {
          seq: 5,
          event_name: "roll_result" as const,
          payload: {
            request_id: "550e8400-e29b-41d4-a716-446655440001",
            formula: "1d20+5",
            rolls: [14],
            total: 19,
            signed: "sig",
          },
          occurred_at: "2025-01-01T00:00:05Z",
        },
      ],
    };
    expect(ServerEvents.parse(msg).events).toHaveLength(1);
  });

  it("rejects server.events with empty events array", () => {
    expect(() =>
      ServerEvents.parse({
        type: "server.events",
        campaign_id: "550e8400-e29b-41d4-a716-446655440000",
        events: [],
      }),
    ).toThrow();
  });

  it("validates server.error", () => {
    const msg = {
      type: "server.error" as const,
      message: "Unauthorized",
      code: "AUTH_FAILED",
    };
    expect(ServerError.parse(msg)).toEqual(msg);
  });

  it("validates server.pong", () => {
    const ts = Date.now();
    expect(ServerPong.parse({ type: "server.pong", ts })).toEqual({
      type: "server.pong",
      ts,
    });
  });

  it("parses discriminated ServerMessage union", () => {
    const hello = ServerMessage.parse({
      type: "server.hello",
      user_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(hello.type).toBe("server.hello");

    const error = ServerMessage.parse({
      type: "server.error",
      message: "bad",
    });
    expect(error.type).toBe("server.error");
  });
});

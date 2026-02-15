import { useGameSocket } from "@/hooks/use-game-socket";
import type { ServerMessage } from "@game-master/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock WebSocket ──────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }

  // Test helpers
  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(msg: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  simulateClose() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.();
  }
}

// ── Setup ───────────────────────────────────────────────────────────────────

const DEFAULTS = {
  wsUrl: "ws://localhost:4001",
  token: "test-token",
  campaignId: "00000000-0000-0000-0000-000000000001",
  enabled: false, // we manually trigger connect via enabled toggle
};

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("useGameSocket", () => {
  it("starts disconnected when not enabled", () => {
    const { result } = renderHook(() => useGameSocket(DEFAULTS));
    expect(result.current.connectionState).toBe("disconnected");
    expect(result.current.events).toEqual([]);
    expect(result.current.snapshot).toBeNull();
  });

  it("sends client.hello on open", () => {
    const { result, rerender } = renderHook((props) => useGameSocket(props), {
      initialProps: { ...DEFAULTS, enabled: true },
    });

    const ws = MockWebSocket.instances[0]!;
    act(() => ws.simulateOpen());

    expect(result.current.connectionState).toBe("authenticating");

    const sent = JSON.parse(ws.sent[0]!);
    expect(sent).toEqual({ type: "client.hello", token: "test-token" });
  });

  it("sends client.join after server.hello", () => {
    const { result } = renderHook(() =>
      useGameSocket({ ...DEFAULTS, enabled: true }),
    );

    const ws = MockWebSocket.instances[0]!;
    act(() => ws.simulateOpen());
    act(() =>
      ws.simulateMessage({
        type: "server.hello",
        user_id: "00000000-0000-0000-0000-000000000099",
      }),
    );

    // Should have sent client.hello + client.join
    expect(ws.sent.length).toBe(2);
    const join = JSON.parse(ws.sent[1]!);
    expect(join.type).toBe("client.join");
    expect(join.campaign_id).toBe(DEFAULTS.campaignId);
  });

  it("sets joined state and snapshot on server.joined", () => {
    const { result } = renderHook(() =>
      useGameSocket({ ...DEFAULTS, enabled: true }),
    );

    const ws = MockWebSocket.instances[0]!;
    act(() => ws.simulateOpen());
    act(() =>
      ws.simulateMessage({
        type: "server.hello",
        user_id: "00000000-0000-0000-0000-000000000099",
      }),
    );

    const snapshot = {
      campaign_id: DEFAULTS.campaignId,
      ruleset: "5e",
      mode: "free" as const,
      rules_flags: { strictness: "standard" as const },
    };

    act(() =>
      ws.simulateMessage({
        type: "server.joined",
        campaign_id: DEFAULTS.campaignId,
        snapshot,
        events: [],
      }),
    );

    expect(result.current.connectionState).toBe("joined");
    expect(result.current.snapshot).toEqual(snapshot);
  });

  it("accumulates events from server.joined and server.events", () => {
    const { result } = renderHook(() =>
      useGameSocket({ ...DEFAULTS, enabled: true }),
    );

    const ws = MockWebSocket.instances[0]!;
    act(() => ws.simulateOpen());
    act(() =>
      ws.simulateMessage({
        type: "server.hello",
        user_id: "00000000-0000-0000-0000-000000000099",
      }),
    );

    const snapshot = {
      campaign_id: DEFAULTS.campaignId,
      ruleset: "5e",
      mode: "free" as const,
      rules_flags: { strictness: "standard" as const },
    };

    const event1 = {
      seq: 1,
      event_name: "dm_narration" as const,
      payload: { text: "Welcome to the tavern." },
      occurred_at: "2025-01-01T00:00:00Z",
    };

    act(() =>
      ws.simulateMessage({
        type: "server.joined",
        campaign_id: DEFAULTS.campaignId,
        snapshot,
        events: [event1],
      }),
    );

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]!.seq).toBe(1);

    const event2 = {
      seq: 2,
      event_name: "player_action" as const,
      payload: {
        text: "I look around",
        user_id: "00000000-0000-0000-0000-000000000099",
        client_msg_id: "00000000-0000-0000-0000-000000000050",
      },
      occurred_at: "2025-01-01T00:00:01Z",
    };

    act(() =>
      ws.simulateMessage({
        type: "server.events",
        campaign_id: DEFAULTS.campaignId,
        events: [event2],
      }),
    );

    expect(result.current.events).toHaveLength(2);
    expect(result.current.events[1]!.seq).toBe(2);
  });

  it("deduplicates events by seq", () => {
    const { result } = renderHook(() =>
      useGameSocket({ ...DEFAULTS, enabled: true }),
    );

    const ws = MockWebSocket.instances[0]!;
    act(() => ws.simulateOpen());
    act(() =>
      ws.simulateMessage({
        type: "server.hello",
        user_id: "00000000-0000-0000-0000-000000000099",
      }),
    );

    const snapshot = {
      campaign_id: DEFAULTS.campaignId,
      ruleset: "5e",
      mode: "free" as const,
      rules_flags: { strictness: "standard" as const },
    };

    const event = {
      seq: 1,
      event_name: "dm_narration" as const,
      payload: { text: "Hello" },
      occurred_at: "2025-01-01T00:00:00Z",
    };

    act(() =>
      ws.simulateMessage({
        type: "server.joined",
        campaign_id: DEFAULTS.campaignId,
        snapshot,
        events: [event],
      }),
    );

    // Send same seq again (replay scenario)
    act(() =>
      ws.simulateMessage({
        type: "server.events",
        campaign_id: DEFAULTS.campaignId,
        events: [event],
      }),
    );

    expect(result.current.events).toHaveLength(1);
  });

  it("sends client.ack after receiving events", () => {
    const { result } = renderHook(() =>
      useGameSocket({ ...DEFAULTS, enabled: true }),
    );

    const ws = MockWebSocket.instances[0]!;
    act(() => ws.simulateOpen());
    act(() =>
      ws.simulateMessage({
        type: "server.hello",
        user_id: "00000000-0000-0000-0000-000000000099",
      }),
    );

    const snapshot = {
      campaign_id: DEFAULTS.campaignId,
      ruleset: "5e",
      mode: "free" as const,
      rules_flags: { strictness: "standard" as const },
    };

    act(() =>
      ws.simulateMessage({
        type: "server.joined",
        campaign_id: DEFAULTS.campaignId,
        snapshot,
        events: [
          {
            seq: 5,
            event_name: "dm_narration" as const,
            payload: { text: "test" },
            occurred_at: "2025-01-01T00:00:00Z",
          },
        ],
      }),
    );

    // Find the ack message
    const ack = ws.sent
      .map((s) => JSON.parse(s))
      .find((m) => m.type === "client.ack");
    expect(ack).toEqual({ type: "client.ack", seq: 5 });
  });

  it("tracks last_seq_seen correctly across batches", () => {
    const { result } = renderHook(() =>
      useGameSocket({ ...DEFAULTS, enabled: true }),
    );

    const ws = MockWebSocket.instances[0]!;
    act(() => ws.simulateOpen());
    act(() =>
      ws.simulateMessage({
        type: "server.hello",
        user_id: "00000000-0000-0000-0000-000000000099",
      }),
    );

    const snapshot = {
      campaign_id: DEFAULTS.campaignId,
      ruleset: "5e",
      mode: "free" as const,
      rules_flags: { strictness: "standard" as const },
    };

    act(() =>
      ws.simulateMessage({
        type: "server.joined",
        campaign_id: DEFAULTS.campaignId,
        snapshot,
        events: [
          {
            seq: 1,
            event_name: "dm_narration" as const,
            payload: { text: "first" },
            occurred_at: "2025-01-01T00:00:00Z",
          },
          {
            seq: 2,
            event_name: "dm_narration" as const,
            payload: { text: "second" },
            occurred_at: "2025-01-01T00:00:01Z",
          },
        ],
      }),
    );

    // lastSeqSeen is a ref that gets updated — check events instead
    expect(result.current.events[result.current.events.length - 1]!.seq).toBe(
      2,
    );

    act(() =>
      ws.simulateMessage({
        type: "server.events",
        campaign_id: DEFAULTS.campaignId,
        events: [
          {
            seq: 3,
            event_name: "roll_result" as const,
            payload: {
              request_id: "00000000-0000-0000-0000-000000000070",
              formula: "1d20",
              rolls: [15],
              total: 15,
              signed: "abc",
            },
            occurred_at: "2025-01-01T00:00:02Z",
          },
        ],
      }),
    );

    expect(result.current.events[result.current.events.length - 1]!.seq).toBe(
      3,
    );
  });

  it("sets error on server.error message", () => {
    const { result } = renderHook(() =>
      useGameSocket({ ...DEFAULTS, enabled: true }),
    );

    const ws = MockWebSocket.instances[0]!;
    act(() => ws.simulateOpen());
    act(() =>
      ws.simulateMessage({
        type: "server.error",
        message: "Invalid token",
        code: "AUTH_FAILED",
      }),
    );

    expect(result.current.error).toBe("Invalid token");
  });

  it("sendAction produces correct client.player_action message", () => {
    const charId = "00000000-0000-0000-0000-000000000042";
    const { result } = renderHook(() =>
      useGameSocket({
        ...DEFAULTS,
        enabled: true,
        characterId: charId,
      }),
    );

    const ws = MockWebSocket.instances[0]!;
    act(() => ws.simulateOpen());

    // Bypass full flow; just call sendAction directly
    act(() => result.current.sendAction("I kick the door"));

    const actionMsg = ws.sent
      .map((s) => JSON.parse(s))
      .find((m) => m.type === "client.player_action");

    expect(actionMsg).toBeDefined();
    expect(actionMsg.campaign_id).toBe(DEFAULTS.campaignId);
    expect(actionMsg.text).toBe("I kick the door");
    expect(actionMsg.character_id).toBe(charId);
    expect(actionMsg.client_msg_id).toBeDefined();
  });
});

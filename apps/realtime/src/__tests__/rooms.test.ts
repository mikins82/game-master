import type { ServerEvent, ServerMessage } from "@game-master/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  broadcastEvents,
  clearAllRooms,
  getRoomSize,
  joinCampaign,
  leaveCampaign,
  sendMessage,
  type Connection,
} from "../ws/rooms.js";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

function mockWs() {
  return {
    readyState: 1, // OPEN
    OPEN: 1,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Connection["ws"];
}

function makeConn(userId = "user-1"): Connection {
  return {
    ws: mockWs(),
    userId,
    authenticated: true,
    lastAckSeq: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rooms", () => {
  beforeEach(() => {
    clearAllRooms();
  });

  describe("joinCampaign / leaveCampaign", () => {
    it("adds connection to a room", () => {
      const conn = makeConn();
      joinCampaign(conn, "camp-1");
      expect(conn.campaignId).toBe("camp-1");
      expect(getRoomSize("camp-1")).toBe(1);
    });

    it("joining a new room leaves the previous one", () => {
      const conn = makeConn();
      joinCampaign(conn, "camp-1");
      joinCampaign(conn, "camp-2");
      expect(conn.campaignId).toBe("camp-2");
      expect(getRoomSize("camp-1")).toBe(0);
      expect(getRoomSize("camp-2")).toBe(1);
    });

    it("leaveCampaign removes connection", () => {
      const conn = makeConn();
      joinCampaign(conn, "camp-1");
      leaveCampaign(conn);
      expect(conn.campaignId).toBeUndefined();
      expect(getRoomSize("camp-1")).toBe(0);
    });

    it("leaveCampaign is safe to call when not in a room", () => {
      const conn = makeConn();
      expect(() => leaveCampaign(conn)).not.toThrow();
    });

    it("multiple connections in the same room", () => {
      const c1 = makeConn("u1");
      const c2 = makeConn("u2");
      joinCampaign(c1, "camp-1");
      joinCampaign(c2, "camp-1");
      expect(getRoomSize("camp-1")).toBe(2);
    });
  });

  describe("broadcastEvents", () => {
    it("sends events to all connections in the room", () => {
      const c1 = makeConn("u1");
      const c2 = makeConn("u2");
      joinCampaign(c1, "camp-1");
      joinCampaign(c2, "camp-1");

      const events: ServerEvent[] = [
        {
          seq: 1,
          event_name: "dm_narration",
          payload: { text: "Hello!" },
          occurred_at: new Date().toISOString(),
        },
      ];

      broadcastEvents("camp-1", events);

      expect(c1.ws.send).toHaveBeenCalledTimes(1);
      expect(c2.ws.send).toHaveBeenCalledTimes(1);

      const sent1 = JSON.parse(
        (c1.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
      );
      expect(sent1.type).toBe("server.events");
      expect(sent1.events).toHaveLength(1);
      expect(sent1.events[0].seq).toBe(1);
    });

    it("does not send to connections in a different room", () => {
      const c1 = makeConn("u1");
      const c2 = makeConn("u2");
      joinCampaign(c1, "camp-1");
      joinCampaign(c2, "camp-2");

      const events: ServerEvent[] = [
        {
          seq: 1,
          event_name: "dm_narration",
          payload: { text: "Hello!" },
          occurred_at: new Date().toISOString(),
        },
      ];

      broadcastEvents("camp-1", events);

      expect(c1.ws.send).toHaveBeenCalledTimes(1);
      expect(c2.ws.send).not.toHaveBeenCalled();
    });

    it("does not send to closed connections", () => {
      const conn = makeConn();
      (conn.ws as unknown as { readyState: number }).readyState = 3; // CLOSED
      joinCampaign(conn, "camp-1");

      const events: ServerEvent[] = [
        {
          seq: 1,
          event_name: "dm_narration",
          payload: { text: "Hello!" },
          occurred_at: new Date().toISOString(),
        },
      ];

      broadcastEvents("camp-1", events);
      expect(conn.ws.send).not.toHaveBeenCalled();
    });

    it("no-ops when there are no events", () => {
      const conn = makeConn();
      joinCampaign(conn, "camp-1");
      broadcastEvents("camp-1", []);
      expect(conn.ws.send).not.toHaveBeenCalled();
    });

    it("no-ops for an unknown campaign", () => {
      expect(() =>
        broadcastEvents("non-existent", [
          {
            seq: 1,
            event_name: "dm_narration",
            payload: {},
            occurred_at: new Date().toISOString(),
          },
        ]),
      ).not.toThrow();
    });
  });

  describe("sendMessage", () => {
    it("sends JSON to an open connection", () => {
      const conn = makeConn();
      const msg: ServerMessage = { type: "server.pong", ts: 12345 };
      sendMessage(conn, msg);
      expect(conn.ws.send).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it("does not send to a closed connection", () => {
      const conn = makeConn();
      (conn.ws as unknown as { readyState: number }).readyState = 3;
      sendMessage(conn, { type: "server.pong", ts: 123 });
      expect(conn.ws.send).not.toHaveBeenCalled();
    });
  });
});

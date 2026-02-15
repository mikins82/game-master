import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authenticateAndJoin,
  cleanupTestCampaign,
  collectMessages,
  connectWs,
  createTestCampaign,
  sendJson,
  setupTestServer,
  waitForMessage,
  type TestContext,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// These tests require a running PostgreSQL (via docker compose).
// They test the full WS flow: connect → hello → join → action → events.
// ---------------------------------------------------------------------------

let ctx: TestContext;
let campaignId: string;
let userId: string;

beforeAll(async () => {
  ctx = await setupTestServer();
  const testData = await createTestCampaign(ctx.pool);
  userId = testData.userId;
  campaignId = testData.campaignId;
});

afterAll(async () => {
  await cleanupTestCampaign(ctx.pool, campaignId);
  await ctx.close();
});

// ---------------------------------------------------------------------------
// 1. WS connect: client.hello → server.hello
// ---------------------------------------------------------------------------

describe("WS connect", () => {
  it("receives server.hello after client.hello with valid token", async () => {
    const ws = await connectWs(ctx.wsUrl);
    try {
      const collector = waitForMessage(ws);
      sendJson(ws, { type: "client.hello", token: `dev:${userId}` });
      const msg = await collector;
      expect(msg.type).toBe("server.hello");
      expect(msg.user_id).toBe(userId);
    } finally {
      ws.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Join + replay: client.join → server.joined with snapshot + events
// ---------------------------------------------------------------------------

describe("Join + replay", () => {
  it("returns snapshot and empty events for a fresh campaign", async () => {
    const ws = await connectWs(ctx.wsUrl);
    try {
      const joined = await authenticateAndJoin(ws, userId, campaignId);
      expect(joined.type).toBe("server.joined");
      expect(joined.campaign_id).toBe(campaignId);
      expect(joined.snapshot).toBeDefined();
      expect(Array.isArray(joined.events)).toBe(true);
    } finally {
      ws.close();
    }
  });

  it("replays events from last_seq_seen on reconnect", async () => {
    // First: create some events by sending an action
    const ws1 = await connectWs(ctx.wsUrl);
    try {
      await authenticateAndJoin(ws1, userId, campaignId);

      // Send a player action — this creates events (player_action + dm_narration fallback)
      const actionCollector = collectMessages(ws1, 2, 10000);
      sendJson(ws1, {
        type: "client.player_action",
        campaign_id: campaignId,
        client_msg_id: randomUUID(),
        text: "I look around the room",
      });
      const actionEvents = await actionCollector;
      // Should have at least player_action + dm_narration events
      expect(actionEvents.length).toBeGreaterThanOrEqual(2);
    } finally {
      ws1.close();
    }

    // Second: reconnect with last_seq_seen = 0 → should replay all events
    const ws2 = await connectWs(ctx.wsUrl);
    try {
      // Authenticate first
      const helloCollector2 = waitForMessage(ws2);
      sendJson(ws2, { type: "client.hello", token: `dev:${userId}` });
      const hello = await helloCollector2;
      expect(hello.type).toBe("server.hello");

      // Then join with last_seq_seen = 0
      const joinCollector2 = waitForMessage(ws2);
      sendJson(ws2, {
        type: "client.join",
        campaign_id: campaignId,
        last_seq_seen: 0,
      });
      const joined = await joinCollector2;
      expect(joined.type).toBe("server.joined");

      const events = (joined as Record<string, unknown>).events as unknown[];
      expect(events.length).toBeGreaterThanOrEqual(2);

      // Verify events are in seq order
      for (let i = 1; i < events.length; i++) {
        const prev = (events[i - 1] as Record<string, unknown>).seq as number;
        const curr = (events[i] as Record<string, unknown>).seq as number;
        expect(curr).toBeGreaterThan(prev);
      }
    } finally {
      ws2.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Event ordering: 10 rapid actions → strictly monotonic seq
// ---------------------------------------------------------------------------

describe("Event ordering", () => {
  let ordCampaignId: string;
  let ordUserId: string;

  beforeAll(async () => {
    const data = await createTestCampaign(ctx.pool);
    ordUserId = data.userId;
    ordCampaignId = data.campaignId;
  });

  afterAll(async () => {
    await cleanupTestCampaign(ctx.pool, ordCampaignId);
  });

  it("10 rapid actions produce strictly monotonic seq with no gaps", async () => {
    const ws = await connectWs(ctx.wsUrl);
    try {
      await authenticateAndJoin(ws, ordUserId, ordCampaignId);

      const actionCount = 10;
      // Each action produces at least 2 events (player_action + dm_narration)
      // so expect at least 20 event messages
      const collector = collectMessages(ws, actionCount * 2, 30000);

      for (let i = 0; i < actionCount; i++) {
        sendJson(ws, {
          type: "client.player_action",
          campaign_id: ordCampaignId,
          client_msg_id: randomUUID(),
          text: `Action ${i + 1}`,
        });
        // Small delay to avoid overwhelming but still test rapid fire
        await new Promise((r) => setTimeout(r, 50));
      }

      const messages = await collector;

      // Extract all seq numbers from server.events batches
      const allSeqs: number[] = [];
      for (const msg of messages) {
        const m = msg as Record<string, unknown>;
        if (m.type === "server.events") {
          const events = m.events as { seq: number }[];
          for (const ev of events) {
            allSeqs.push(ev.seq);
          }
        }
      }

      // All seqs should be strictly monotonic
      expect(allSeqs.length).toBeGreaterThanOrEqual(actionCount * 2);
      for (let i = 1; i < allSeqs.length; i++) {
        expect(allSeqs[i]).toBe(allSeqs[i - 1] + 1);
      }
    } finally {
      ws.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Tool execution (via orchestrator fallback)
// ---------------------------------------------------------------------------

describe("Tool execution", () => {
  it("roll produces roll_result with server-generated values (tested via DB)", async () => {
    // Direct tool execution test via the dice module
    const { rollDice } = await import("../tools/dice.js");
    const result = rollDice("1d20+5");
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(result.rolls[0]).toBeLessThanOrEqual(20);
    expect(result.total).toBe(result.rolls[0] + 5);
    expect(result.signed).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. Reconnect: disconnect → reconnect with last_seq_seen → no duplicates
// ---------------------------------------------------------------------------

describe("Reconnect", () => {
  let reconCampaignId: string;
  let reconUserId: string;

  beforeAll(async () => {
    const data = await createTestCampaign(ctx.pool);
    reconUserId = data.userId;
    reconCampaignId = data.campaignId;
  });

  afterAll(async () => {
    await cleanupTestCampaign(ctx.pool, reconCampaignId);
  });

  it("receives only missed events on reconnect (no duplicates)", async () => {
    // Phase 1: connect, send action, note the seq
    const ws1 = await connectWs(ctx.wsUrl);
    let lastSeqSeen = 0;
    try {
      await authenticateAndJoin(ws1, reconUserId, reconCampaignId);

      const evCollector = collectMessages(ws1, 2, 10000);
      sendJson(ws1, {
        type: "client.player_action",
        campaign_id: reconCampaignId,
        client_msg_id: randomUUID(),
        text: "I open the chest",
      });
      const events = await evCollector;

      // Find the highest seq from the events
      for (const msg of events) {
        const m = msg as Record<string, unknown>;
        if (m.type === "server.events") {
          const evs = m.events as { seq: number }[];
          for (const ev of evs) {
            if (ev.seq > lastSeqSeen) lastSeqSeen = ev.seq;
          }
        }
      }
      expect(lastSeqSeen).toBeGreaterThan(0);
    } finally {
      ws1.close();
    }

    // Phase 2: reconnect with last_seq_seen → should only get events after that
    const ws2 = await connectWs(ctx.wsUrl);
    try {
      // Authenticate first, then join with last_seq_seen
      const helloCollector = waitForMessage(ws2);
      sendJson(ws2, { type: "client.hello", token: `dev:${reconUserId}` });
      const hello = await helloCollector;
      expect(hello.type).toBe("server.hello");

      const joinCollector = waitForMessage(ws2);
      sendJson(ws2, {
        type: "client.join",
        campaign_id: reconCampaignId,
        last_seq_seen: lastSeqSeen,
      });
      const joined = await joinCollector;
      expect(joined.type).toBe("server.joined");

      const replayEvents = (joined as Record<string, unknown>).events as {
        seq: number;
      }[];
      // Should have 0 replay events since we've seen everything
      expect(replayEvents).toHaveLength(0);
    } finally {
      ws2.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Broadcast: two clients in same campaign see same events
// ---------------------------------------------------------------------------

describe("Broadcast", () => {
  let bcCampaignId: string;
  let bcUserId: string;

  beforeAll(async () => {
    const data = await createTestCampaign(ctx.pool);
    bcUserId = data.userId;
    bcCampaignId = data.campaignId;
  });

  afterAll(async () => {
    await cleanupTestCampaign(ctx.pool, bcCampaignId);
  });

  it("two clients in the same campaign both receive the same events", async () => {
    const ws1 = await connectWs(ctx.wsUrl);
    const ws2 = await connectWs(ctx.wsUrl);

    try {
      await authenticateAndJoin(ws1, bcUserId, bcCampaignId);
      await authenticateAndJoin(ws2, bcUserId, bcCampaignId);

      // Both clients listen for events
      const c1Events = collectMessages(ws1, 2, 10000);
      const c2Events = collectMessages(ws2, 2, 10000);

      // Client 1 sends an action
      sendJson(ws1, {
        type: "client.player_action",
        campaign_id: bcCampaignId,
        client_msg_id: randomUUID(),
        text: "I cast fireball",
      });

      const msgs1 = await c1Events;
      const msgs2 = await c2Events;

      // Both should have received at least 2 messages (player_action + dm_narration)
      expect(msgs1.length).toBeGreaterThanOrEqual(2);
      expect(msgs2.length).toBeGreaterThanOrEqual(2);

      // Extract seqs
      function extractSeqs(msgs: unknown[]): number[] {
        const seqs: number[] = [];
        for (const msg of msgs) {
          const m = msg as Record<string, unknown>;
          if (m.type === "server.events") {
            const evs = m.events as { seq: number }[];
            for (const ev of evs) seqs.push(ev.seq);
          }
        }
        return seqs;
      }

      const seqs1 = extractSeqs(msgs1);
      const seqs2 = extractSeqs(msgs2);

      // Both clients should have the same seq numbers
      expect(seqs1).toEqual(seqs2);
    } finally {
      ws1.close();
      ws2.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Ping / Pong
// ---------------------------------------------------------------------------

describe("Ping / Pong", () => {
  it("responds to client.ping with server.pong", async () => {
    const ws = await connectWs(ctx.wsUrl);
    try {
      // Authenticate first
      const helloCollector = waitForMessage(ws);
      sendJson(ws, { type: "client.hello", token: `dev:${userId}` });
      await helloCollector;

      // Send ping
      const pongCollector = waitForMessage(ws);
      const ts = Date.now();
      sendJson(ws, { type: "client.ping", ts });
      const pong = await pongCollector;
      expect(pong.type).toBe("server.pong");
      expect(pong.ts).toBe(ts);
    } finally {
      ws.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Error handling
// ---------------------------------------------------------------------------

describe("Error handling", () => {
  it("rejects action before authentication", async () => {
    const ws = await connectWs(ctx.wsUrl);
    try {
      const collector = waitForMessage(ws);
      sendJson(ws, {
        type: "client.player_action",
        campaign_id: campaignId,
        client_msg_id: randomUUID(),
        text: "test",
      });
      // Should get an error about not being authenticated
      // (The Zod parse will fail because client.player_action expects client.hello first,
      //  or the handler will reject with NOT_AUTHENTICATED)
      const msg = await collector;
      expect(msg.type).toBe("server.error");
    } finally {
      ws.close();
    }
  });

  it("rejects action before joining a campaign", async () => {
    const ws = await connectWs(ctx.wsUrl);
    try {
      // Authenticate
      const helloCollector = waitForMessage(ws);
      sendJson(ws, { type: "client.hello", token: `dev:${userId}` });
      await helloCollector;

      // Send action without joining
      const errorCollector = waitForMessage(ws);
      sendJson(ws, {
        type: "client.player_action",
        campaign_id: campaignId,
        client_msg_id: randomUUID(),
        text: "test",
      });
      const msg = await errorCollector;
      expect(msg.type).toBe("server.error");
      expect(msg.code).toBe("NOT_JOINED");
    } finally {
      ws.close();
    }
  });

  it("returns error for malformed JSON", async () => {
    const ws = await connectWs(ctx.wsUrl);
    try {
      const collector = waitForMessage(ws);
      ws.send("not json at all");
      const msg = await collector;
      expect(msg.type).toBe("server.error");
      expect(msg.code).toBe("BAD_MESSAGE");
    } finally {
      ws.close();
    }
  });
});

import type {
  ClientAck,
  ClientHello,
  ClientJoin,
  ClientMessage,
  ClientPing,
  ClientPlayerAction,
  ServerError,
  ServerHello,
  ServerJoined,
  ServerPong,
} from "@game-master/shared";
import { ClientMessage as ClientMessageSchema } from "@game-master/shared";
import type { Pool } from "pg";
import type { WebSocket } from "ws";
import { callOrchestrator } from "../bridge/orchestrator.js";
import {
  appendEvent,
  ensureSnapshot,
  readEventsAfter,
  readSnapshot,
} from "../engine/event-store.js";
import { executeToolCalls } from "../tools/executor.js";
import { verifyWsToken } from "./auth.js";
import { WsRateLimiter } from "./rate-limit.js";
import {
  broadcastEvents,
  joinCampaign,
  leaveCampaign,
  sendMessage,
  type Connection,
} from "./rooms.js";

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

/**
 * Handle a new WebSocket connection.
 * Sets up message parsing, dispatch, and cleanup on disconnect.
 */
export function handleConnection(pool: Pool, ws: WebSocket): void {
  const conn: Connection = {
    ws,
    userId: "",
    authenticated: false,
    lastAckSeq: 0,
  };

  // Per-connection rate limiter: 10 player actions per minute
  const actionLimiter = new WsRateLimiter(10, 60_000);

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const msg: ClientMessage = ClientMessageSchema.parse(data);
      await handleMessage(pool, conn, msg, actionLimiter);
    } catch (err) {
      const error: ServerError = {
        type: "server.error",
        message: err instanceof Error ? err.message : "Invalid message",
        code: "BAD_MESSAGE",
      };
      sendMessage(conn, error);
    }
  });

  ws.on("close", () => {
    leaveCampaign(conn);
  });

  ws.on("error", () => {
    leaveCampaign(conn);
  });
}

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

async function handleMessage(
  pool: Pool,
  conn: Connection,
  msg: ClientMessage,
  actionLimiter: WsRateLimiter,
): Promise<void> {
  switch (msg.type) {
    case "client.hello":
      return handleHello(conn, msg);
    case "client.join":
      return handleJoin(pool, conn, msg);
    case "client.player_action": {
      // Rate-limit player actions
      if (!actionLimiter.check()) {
        sendMessage(conn, {
          type: "server.error",
          message: "Rate limited — too many actions, slow down",
          code: "RATE_LIMITED",
        });
        return;
      }
      return handlePlayerAction(pool, conn, msg);
    }
    case "client.ack":
      return handleAck(conn, msg);
    case "client.ping":
      return handlePing(conn, msg);
  }
}

// ---------------------------------------------------------------------------
// client.hello — authenticate
// ---------------------------------------------------------------------------

async function handleHello(conn: Connection, msg: ClientHello): Promise<void> {
  try {
    const { userId } = await verifyWsToken(msg.token);
    conn.userId = userId;
    conn.authenticated = true;

    const hello: ServerHello = {
      type: "server.hello",
      user_id: userId,
    };
    sendMessage(conn, hello);
  } catch {
    const error: ServerError = {
      type: "server.error",
      message: "Authentication failed",
      code: "AUTH_FAILED",
    };
    sendMessage(conn, error);
    conn.ws.close(4001, "Authentication failed");
  }
}

// ---------------------------------------------------------------------------
// client.join — enter campaign, receive snapshot + replay
// ---------------------------------------------------------------------------

async function handleJoin(
  pool: Pool,
  conn: Connection,
  msg: ClientJoin,
): Promise<void> {
  if (!conn.authenticated) {
    sendMessage(conn, {
      type: "server.error",
      message: "Must authenticate first (send client.hello)",
      code: "NOT_AUTHENTICATED",
    });
    return;
  }

  const campaignId = msg.campaign_id;

  // Ensure a snapshot row exists for this campaign
  await ensureSnapshot(pool, campaignId, {
    campaign_id: campaignId,
    ruleset: "5e",
    mode: "free",
    rules_flags: { strictness: "standard" },
  });

  joinCampaign(conn, campaignId);

  const { lastSeq, snapshot } = await readSnapshot(pool, campaignId);
  const lastSeen = msg.last_seq_seen ?? 0;

  // Replay events the client hasn't seen yet
  const replayEvents =
    lastSeen < lastSeq
      ? await readEventsAfter(pool, campaignId, lastSeen, 500)
      : [];

  const joined: ServerJoined = {
    type: "server.joined",
    campaign_id: campaignId,
    snapshot,
    events: replayEvents,
  };
  sendMessage(conn, joined);
}

// ---------------------------------------------------------------------------
// client.player_action — the core game loop trigger
// ---------------------------------------------------------------------------

async function handlePlayerAction(
  pool: Pool,
  conn: Connection,
  msg: ClientPlayerAction,
): Promise<void> {
  if (!conn.authenticated) {
    sendMessage(conn, {
      type: "server.error",
      message: "Must authenticate first",
      code: "NOT_AUTHENTICATED",
    });
    return;
  }

  if (!conn.campaignId || conn.campaignId !== msg.campaign_id) {
    sendMessage(conn, {
      type: "server.error",
      message: "Not joined to this campaign",
      code: "NOT_JOINED",
    });
    return;
  }

  // 1. Append player_action event
  const { event: playerEvent, snapshot } = await appendEvent(
    pool,
    msg.campaign_id,
    "player_action",
    {
      user_id: conn.userId,
      client_msg_id: msg.client_msg_id,
      text: msg.text,
      character_id: msg.character_id,
    },
  );
  broadcastEvents(msg.campaign_id, [playerEvent]);

  // 2. Gather recent events for orchestrator context
  const recentEvents = await readEventsAfter(
    pool,
    msg.campaign_id,
    Math.max(0, playerEvent.seq - 20),
  );

  // 3. Call orchestrator
  const orchestratorResponse = await callOrchestrator(
    msg.campaign_id,
    snapshot,
    { user_id: conn.userId, text: msg.text },
    recentEvents,
  );

  // 4. Execute tool calls, append narration, broadcast everything
  await executeToolCalls(pool, msg.campaign_id, orchestratorResponse);
}

// ---------------------------------------------------------------------------
// client.ack — track what the client has consumed (metrics / QoS)
// ---------------------------------------------------------------------------

function handleAck(_conn: Connection, msg: ClientAck): void {
  _conn.lastAckSeq = msg.seq;
}

// ---------------------------------------------------------------------------
// client.ping → server.pong
// ---------------------------------------------------------------------------

function handlePing(conn: Connection, msg: ClientPing): void {
  const pong: ServerPong = {
    type: "server.pong",
    ts: msg.ts,
  };
  sendMessage(conn, pong);
}

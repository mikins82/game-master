import type {
  ServerEvent,
  ServerEvents,
  ServerMessage,
} from "@game-master/shared";
import type { WebSocket } from "ws";

// ---------------------------------------------------------------------------
// Connection type
// ---------------------------------------------------------------------------

export type Connection = {
  ws: WebSocket;
  userId: string;
  campaignId?: string;
  authenticated: boolean;
  lastAckSeq: number;
};

// ---------------------------------------------------------------------------
// In-memory room registry: campaignId -> Set<Connection>
// ---------------------------------------------------------------------------

const campaigns = new Map<string, Set<Connection>>();

/**
 * Add a connection to a campaign room.
 * Automatically leaves any previous room first.
 */
export function joinCampaign(conn: Connection, campaignId: string): void {
  leaveCampaign(conn);
  conn.campaignId = campaignId;
  if (!campaigns.has(campaignId)) {
    campaigns.set(campaignId, new Set());
  }
  campaigns.get(campaignId)!.add(conn);
}

/**
 * Remove a connection from its current campaign room.
 */
export function leaveCampaign(conn: Connection): void {
  if (!conn.campaignId) return;
  const room = campaigns.get(conn.campaignId);
  if (room) {
    room.delete(conn);
    if (room.size === 0) campaigns.delete(conn.campaignId);
  }
  conn.campaignId = undefined;
}

/**
 * Broadcast a batch of events to all connections in a campaign room.
 */
export function broadcastEvents(
  campaignId: string,
  events: ServerEvent[],
): void {
  const room = campaigns.get(campaignId);
  if (!room || events.length === 0) return;

  const message: ServerEvents = {
    type: "server.events" as const,
    campaign_id: campaignId,
    events,
  };
  const data = JSON.stringify(message);

  for (const conn of room) {
    if (conn.ws.readyState === conn.ws.OPEN) {
      conn.ws.send(data);
    }
  }
}

/**
 * Send a single message to a specific connection.
 */
export function sendMessage(conn: Connection, msg: ServerMessage): void {
  if (conn.ws.readyState === conn.ws.OPEN) {
    conn.ws.send(JSON.stringify(msg));
  }
}

/**
 * Get the number of connections in a campaign room.
 */
export function getRoomSize(campaignId: string): number {
  return campaigns.get(campaignId)?.size ?? 0;
}

/**
 * Clear all rooms (for testing).
 */
export function clearAllRooms(): void {
  campaigns.clear();
}

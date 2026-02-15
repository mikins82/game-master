import type { Pool } from "pg";
import pg from "pg";
import WebSocket from "ws";
import { createServer } from "../server.js";
import { clearAllRooms } from "../ws/rooms.js";

// ---------------------------------------------------------------------------
// Server setup / teardown
// ---------------------------------------------------------------------------

export type TestContext = {
  app: Awaited<ReturnType<typeof createServer>>;
  pool: Pool;
  port: number;
  wsUrl: string;
  close: () => Promise<void>;
};

export async function setupTestServer(): Promise<TestContext> {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/game_master";

  const pool = new pg.Pool({ connectionString });

  const app = await createServer(pool);
  await app.listen({ port: 0, host: "127.0.0.1" });

  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  return {
    app,
    pool,
    port,
    wsUrl,
    async close() {
      clearAllRooms();
      await app.close();
      await pool.end();
    },
  };
}

// ---------------------------------------------------------------------------
// Test campaign helpers
// ---------------------------------------------------------------------------

/**
 * Create an isolated test user + campaign + snapshot for integration tests.
 * Returns the IDs for use in test messages.
 */
export async function createTestCampaign(pool: Pool): Promise<{
  userId: string;
  campaignId: string;
}> {
  const userRes = await pool.query(
    `INSERT INTO app_user (email, username, password_hash)
     VALUES ($1, $2, 'test-hash')
     RETURNING id`,
    [
      `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      `testuser-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ],
  );
  const userId: string = userRes.rows[0].id;

  const campRes = await pool.query(
    `INSERT INTO campaign (owner_id, name, ruleset)
     VALUES ($1, 'Test Campaign', '5e')
     RETURNING id`,
    [userId],
  );
  const campaignId: string = campRes.rows[0].id;

  // Create the initial snapshot
  await pool.query(
    `INSERT INTO game_snapshot (campaign_id, last_seq, snapshot)
     VALUES ($1, 0, $2::jsonb)
     ON CONFLICT (campaign_id) DO NOTHING`,
    [
      campaignId,
      JSON.stringify({
        campaign_id: campaignId,
        ruleset: "5e",
        mode: "free",
        rules_flags: { strictness: "standard" },
      }),
    ],
  );

  return { userId, campaignId };
}

/**
 * Clean up test data after tests.
 */
export async function cleanupTestCampaign(
  pool: Pool,
  campaignId: string,
): Promise<void> {
  // Cascade deletes handle events, snapshot, etc.
  await pool.query(`DELETE FROM campaign WHERE id = $1`, [campaignId]);
}

// ---------------------------------------------------------------------------
// WebSocket client helpers
// ---------------------------------------------------------------------------

/**
 * Connect a WebSocket client and wait for the connection to open.
 */
export function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

/**
 * Wait for the next N messages on a WebSocket.
 */
export function collectMessages(
  ws: WebSocket,
  count: number,
  timeoutMs = 5000,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const messages: unknown[] = [];

    const timer = setTimeout(() => {
      ws.removeListener("message", handler);
      if (messages.length > 0) resolve(messages);
      else
        reject(
          new Error(
            `Timeout: expected ${count} messages, got ${messages.length}`,
          ),
        );
    }, timeoutMs);

    function handler(data: WebSocket.Data) {
      messages.push(JSON.parse(data.toString()));
      if (messages.length >= count) {
        clearTimeout(timer);
        ws.removeListener("message", handler);
        resolve(messages);
      }
    }

    ws.on("message", handler);
  });
}

/**
 * Wait for a single message on a WebSocket.
 */
export function waitForMessage(
  ws: WebSocket,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  return collectMessages(ws, 1, timeoutMs).then(
    (msgs) => msgs[0] as Record<string, unknown>,
  );
}

/**
 * Send a JSON message over a WebSocket.
 */
export function sendJson(ws: WebSocket, msg: unknown): void {
  ws.send(JSON.stringify(msg));
}

/**
 * Authenticate a WS client (hello + join) and return the server.joined message.
 * Waits for server.hello before sending join to avoid a race condition.
 */
export async function authenticateAndJoin(
  ws: WebSocket,
  userId: string,
  campaignId: string,
): Promise<Record<string, unknown>> {
  // Step 1: send hello and wait for server.hello
  const helloCollector = waitForMessage(ws);
  sendJson(ws, { type: "client.hello", token: `dev:${userId}` });
  const hello = await helloCollector;
  if (hello.type !== "server.hello") {
    throw new Error(`Expected server.hello, got ${hello.type}`);
  }

  // Step 2: send join and wait for server.joined
  const joinedCollector = waitForMessage(ws);
  sendJson(ws, { type: "client.join", campaign_id: campaignId });
  const joined = await joinedCollector;
  if (joined.type !== "server.joined") {
    throw new Error(`Expected server.joined, got ${joined.type}`);
  }

  return joined;
}

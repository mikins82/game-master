// ---------------------------------------------------------------------------
// Acceptance-test helpers — HTTP + WebSocket utilities
// ---------------------------------------------------------------------------

import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Service URLs (override via env for Docker / CI)
// ---------------------------------------------------------------------------
export const API_URL = process.env.API_URL ?? "http://localhost:3001";
export const WS_URL = process.env.WS_URL ?? "ws://localhost:8082";

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export async function get(
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${API_URL}${path}`, { headers });
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

let userCounter = 0;

export async function registerAndLogin(): Promise<{
  token: string;
  userId: string;
}> {
  const username = `testuser_${Date.now()}_${userCounter++}`;
  const password = "TestPass123!";

  await post("/api/auth/register", { username, password });

  const loginRes = await post("/api/auth/login", { username, password });
  const loginBody = (await loginRes.json()) as {
    token: string;
    user: { id: string };
  };
  return { token: loginBody.token, userId: loginBody.user.id };
}

export async function createCampaign(
  token: string,
  name = "Test Campaign",
): Promise<string> {
  const res = await post(
    "/api/campaigns",
    { name, description: "Acceptance test campaign" },
    { Authorization: `Bearer ${token}` },
  );
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function getWsToken(
  token: string,
  campaignId: string,
): Promise<string> {
  const res = await post(
    "/api/ws-token",
    { campaign_id: campaignId },
    { Authorization: `Bearer ${token}` },
  );
  const body = (await res.json()) as { token: string };
  return body.token;
}

// ---------------------------------------------------------------------------
// WebSocket helpers
// ---------------------------------------------------------------------------

export interface WsClient {
  ws: WebSocket;
  messages: unknown[];
  send: (msg: unknown) => void;
  waitFor: (
    type: string,
    timeoutMs?: number,
  ) => Promise<Record<string, unknown>>;
  close: () => void;
}

export function connectWs(url: string = WS_URL): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${url}/ws`);
    const messages: unknown[] = [];
    const waiters: Array<{
      type: string;
      resolve: (msg: Record<string, unknown>) => void;
      reject: (err: Error) => void;
    }> = [];

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      messages.push(msg);

      // Resolve any matching waiters
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (msg.type === waiters[i].type) {
          waiters[i].resolve(msg);
          waiters.splice(i, 1);
        }
      }
    });

    ws.on("open", () => {
      resolve({
        ws,
        messages,
        send: (msg: unknown) => ws.send(JSON.stringify(msg)),
        waitFor: (type: string, timeoutMs = 10_000) =>
          new Promise((res, rej) => {
            // Check already received messages
            const existing = messages.find(
              (m) => (m as Record<string, unknown>).type === type,
            ) as Record<string, unknown> | undefined;
            if (existing) {
              res(existing);
              return;
            }
            const timer = setTimeout(
              () => rej(new Error(`Timeout waiting for ${type}`)),
              timeoutMs,
            );
            waiters.push({
              type,
              resolve: (msg) => {
                clearTimeout(timer);
                res(msg);
              },
              reject: rej,
            });
          }),
        close: () => ws.close(),
      });
    });

    ws.on("error", reject);
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// WS token route integration tests
// ---------------------------------------------------------------------------

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cleanDb,
  closeTestApp,
  createCampaign,
  getTestApp,
  registerUser,
} from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await getTestApp();
});
afterAll(async () => {
  await closeTestApp();
});
beforeEach(async () => {
  await cleanDb(app);
});

describe("POST /api/ws-token", () => {
  it("should issue a short-lived WS token with correct claims", async () => {
    const { token, user } = await registerUser(app);
    const camp = await createCampaign(app, token);

    const res = await app.inject({
      method: "POST",
      url: "/api/ws-token",
      headers: { authorization: `Bearer ${token}` },
      payload: { campaign_id: camp.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();

    // Decode and verify claims
    const decoded = app.jwt.decode<{
      sub: string;
      campaign_id: string;
      role: string;
      purpose: string;
    }>(body.token);

    expect(decoded).toBeDefined();
    expect(decoded!.sub).toBe(user.id);
    expect(decoded!.campaign_id).toBe(camp.id);
    expect(decoded!.role).toBe("dm");
    expect(decoded!.purpose).toBe("ws");
  });

  it("should reject non-members", async () => {
    const owner = await registerUser(app, {
      email: "ws-own@test.com",
      username: "wsown",
    });
    const other = await registerUser(app, {
      email: "ws-oth@test.com",
      username: "wsoth",
    });
    const camp = await createCampaign(app, owner.token);

    const res = await app.inject({
      method: "POST",
      url: "/api/ws-token",
      headers: { authorization: `Bearer ${other.token}` },
      payload: { campaign_id: camp.id },
    });

    expect(res.statusCode).toBe(403);
  });

  it("should reject unauthenticated requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/ws-token",
      payload: { campaign_id: "00000000-0000-0000-0000-000000000000" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("should reject invalid payload", async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/ws-token",
      headers: { authorization: `Bearer ${token}` },
      payload: { campaign_id: "not-a-uuid" },
    });

    expect(res.statusCode).toBe(400);
  });
});

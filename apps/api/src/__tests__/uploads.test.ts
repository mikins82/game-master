// ---------------------------------------------------------------------------
// Upload route integration tests
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

describe("POST /api/uploads", () => {
  it("should accept an upload from a DM", async () => {
    const { token } = await registerUser(app);
    const camp = await createCampaign(app, token);

    const res = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        campaign_id: camp.id,
        filename: "rules.pdf",
        content_type: "application/pdf",
        source: "PHB",
        metadata: { edition: "5e" },
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.message).toBe("Upload queued for processing");
    // Queue is disabled in tests, so job_id will be null
    expect(body.job_id).toBeNull();
  });

  it("should reject uploads from non-DM players", async () => {
    const owner = await registerUser(app, {
      email: "upo@test.com",
      username: "upo",
    });
    const player = await registerUser(app, {
      email: "upp@test.com",
      username: "upp",
    });
    const camp = await createCampaign(app, owner.token);

    // Player joins campaign
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${camp.id}/join`,
      headers: { authorization: `Bearer ${player.token}` },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: { authorization: `Bearer ${player.token}` },
      payload: {
        campaign_id: camp.id,
        filename: "rules.pdf",
        content_type: "application/pdf",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("should reject unauthenticated requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/uploads",
      payload: {
        campaign_id: "00000000-0000-0000-0000-000000000000",
        filename: "test.pdf",
        content_type: "application/pdf",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("should reject invalid payload", async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: { authorization: `Bearer ${token}` },
      payload: { campaign_id: "not-uuid" },
    });

    expect(res.statusCode).toBe(400);
  });
});

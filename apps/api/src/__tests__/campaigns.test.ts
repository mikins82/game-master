// ---------------------------------------------------------------------------
// Campaign route integration tests
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

describe("POST /api/campaigns", () => {
  it("should create a campaign", async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Dragon Quest", ruleset: "dnd5e" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.campaign.name).toBe("Dragon Quest");
    expect(body.campaign.ruleset).toBe("dnd5e");
    expect(body.campaign.id).toBeDefined();
  });

  it("should reject unauthenticated requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      payload: { name: "Test" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("should reject invalid payload", async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/campaigns", () => {
  it("should list campaigns user belongs to", async () => {
    const { token } = await registerUser(app);
    await createCampaign(app, token, { name: "Campaign A" });
    await createCampaign(app, token, { name: "Campaign B" });

    const res = await app.inject({
      method: "GET",
      url: "/api/campaigns",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.campaigns).toHaveLength(2);
  });

  it("should return empty list for user with no campaigns", async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/campaigns",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().campaigns).toHaveLength(0);
  });
});

describe("GET /api/campaigns/:id", () => {
  it("should get campaign details for a member", async () => {
    const { token } = await registerUser(app);
    const camp = await createCampaign(app, token);

    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/${camp.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.campaign.id).toBe(camp.id);
    expect(body.players).toBeDefined();
    expect(body.players.length).toBeGreaterThan(0);
  });

  it("should return 403 for non-members", async () => {
    const owner = await registerUser(app, {
      email: "owner@test.com",
      username: "owner",
    });
    const other = await registerUser(app, {
      email: "other@test.com",
      username: "other",
    });
    const camp = await createCampaign(app, owner.token);

    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/${camp.id}`,
      headers: { authorization: `Bearer ${other.token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it("should return 404 for non-existent campaign", async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/campaigns/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/campaigns/:id/join", () => {
  it("should allow a user to join a campaign", async () => {
    const owner = await registerUser(app, {
      email: "own@test.com",
      username: "own",
    });
    const joiner = await registerUser(app, {
      email: "join@test.com",
      username: "joiner",
    });
    const camp = await createCampaign(app, owner.token);

    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${camp.id}/join`,
      headers: { authorization: `Bearer ${joiner.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("player");
  });

  it("should handle already-joined gracefully", async () => {
    const { token } = await registerUser(app);
    const camp = await createCampaign(app, token);

    // Creator is already DM
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${camp.id}/join`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe("Already a member");
  });

  it("should return 404 for non-existent campaign", async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/campaigns/00000000-0000-0000-0000-000000000000/join",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

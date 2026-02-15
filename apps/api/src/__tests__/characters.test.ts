// ---------------------------------------------------------------------------
// Character route integration tests
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

describe("POST /api/characters", () => {
  it("should create a character in a campaign", async () => {
    const { token } = await registerUser(app);
    const camp = await createCampaign(app, token);

    const res = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        campaign_id: camp.id,
        name: "Aragorn",
        data: { class: "ranger", level: 5 },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.character.name).toBe("Aragorn");
    expect(body.character.data).toEqual({ class: "ranger", level: 5 });
  });

  it("should reject creation for non-members", async () => {
    const owner = await registerUser(app, {
      email: "o@test.com",
      username: "owner",
    });
    const other = await registerUser(app, {
      email: "x@test.com",
      username: "other",
    });
    const camp = await createCampaign(app, owner.token);

    const res = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { authorization: `Bearer ${other.token}` },
      payload: { campaign_id: camp.id, name: "NotAllowed" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("should reject invalid payload", async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { authorization: `Bearer ${token}` },
      payload: { campaign_id: "not-a-uuid", name: "" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/characters", () => {
  it("should list characters in a campaign", async () => {
    const { token } = await registerUser(app);
    const camp = await createCampaign(app, token);

    // Create two characters
    await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { authorization: `Bearer ${token}` },
      payload: { campaign_id: camp.id, name: "Fighter" },
    });
    await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { authorization: `Bearer ${token}` },
      payload: { campaign_id: camp.id, name: "Wizard" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/characters?campaign_id=${camp.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().characters).toHaveLength(2);
  });

  it("should reject listing for non-members", async () => {
    const owner = await registerUser(app, {
      email: "o2@test.com",
      username: "own2",
    });
    const other = await registerUser(app, {
      email: "x2@test.com",
      username: "oth2",
    });
    const camp = await createCampaign(app, owner.token);

    const res = await app.inject({
      method: "GET",
      url: `/api/characters?campaign_id=${camp.id}`,
      headers: { authorization: `Bearer ${other.token}` },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe("PATCH /api/characters/:id", () => {
  it("should update a character", async () => {
    const { token } = await registerUser(app);
    const camp = await createCampaign(app, token);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { authorization: `Bearer ${token}` },
      payload: { campaign_id: camp.id, name: "OldName", data: { level: 1 } },
    });
    const charId = createRes.json().character.id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/characters/${charId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "NewName", data: { level: 2 } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().character.name).toBe("NewName");
    expect(res.json().character.data).toEqual({ level: 2 });
  });

  it("should return 404 for characters owned by others", async () => {
    const owner = await registerUser(app, {
      email: "o3@test.com",
      username: "own3",
    });
    const other = await registerUser(app, {
      email: "x3@test.com",
      username: "oth3",
    });
    const camp = await createCampaign(app, owner.token);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { campaign_id: camp.id, name: "OwnerChar" },
    });
    const charId = createRes.json().character.id;

    // Other user tries to update
    const res = await app.inject({
      method: "PATCH",
      url: `/api/characters/${charId}`,
      headers: { authorization: `Bearer ${other.token}` },
      payload: { name: "Hacked" },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Auth route integration tests
// ---------------------------------------------------------------------------

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDb, closeTestApp, getTestApp } from "./helpers.js";

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

describe("POST /api/auth/register", () => {
  it("should register a new user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "new@test.com",
        username: "newuser",
        password: "password123",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("new@test.com");
    expect(body.user.username).toBe("newuser");
    expect(body.user.id).toBeDefined();
    // Password hash should not be returned
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("should reject duplicate email", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "dup@test.com",
        username: "user1",
        password: "password123",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "dup@test.com",
        username: "user2",
        password: "password123",
      },
    });

    expect(res.statusCode).toBe(409);
  });

  it("should reject invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", password: "12" },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.details).toBeDefined();
    expect(body.details.length).toBeGreaterThan(0);
  });
});

describe("POST /api/auth/login", () => {
  it("should login with correct credentials", async () => {
    // Register first
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "login@test.com",
        username: "loginuser",
        password: "password123",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "login@test.com", password: "password123" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe("string");
    expect(body.user.email).toBe("login@test.com");
  });

  it("should reject invalid credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@test.com", password: "wrong" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("should reject wrong password", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "wrongpw@test.com",
        username: "wrongpw",
        password: "correctpassword",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "wrongpw@test.com", password: "wrongpassword" },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("should refresh a valid token", async () => {
    // Register + login
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "refresh@test.com",
        username: "refreshuser",
        password: "password123",
      },
    });

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "refresh@test.com", password: "password123" },
    });
    const token = loginRes.json().token;

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeDefined();
  });

  it("should reject requests without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("dev-mode auth bypass", () => {
  it("should allow x-dev-user-id header in dev mode", async () => {
    // Register a user first so the campaign routes can find them
    const regRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "dev@test.com",
        username: "devuser",
        password: "password123",
      },
    });
    const userId = regRes.json().user.id;

    // Use dev header to access protected route
    const res = await app.inject({
      method: "GET",
      url: "/api/campaigns",
      headers: { "x-dev-user-id": userId },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Test helpers — shared across all integration tests
// ---------------------------------------------------------------------------

import { sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

let _app: FastifyInstance | null = null;

/**
 * Get (or create) a shared Fastify instance for tests.
 * Uses real Postgres, no BullMQ queue.
 */
export async function getTestApp(): Promise<FastifyInstance> {
  if (_app) return _app;

  _app = await buildApp({
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5433/game_master",
      JWT_SECRET: "test-secret",
      AUTH_MODE: "dev",
    },
    disableQueue: true,
  });

  await _app.ready();
  return _app;
}

/** Close the shared app after all tests. */
export async function closeTestApp() {
  if (_app) {
    await _app.close();
    _app = null;
  }
}

/**
 * Truncate all user-created tables (preserves schema).
 * Call in beforeEach for isolation.
 */
export async function cleanDb(app: FastifyInstance) {
  await app.db.execute(sql`
    TRUNCATE
      rag_chunk,
      rag_document,
      campaign_summary,
      game_snapshot,
      game_event,
      "character",
      campaign_player,
      npc,
      location,
      campaign,
      app_user
    CASCADE
  `);
}

/** Register a user and return the user object + JWT token. */
export async function registerUser(
  app: FastifyInstance,
  overrides: { email?: string; username?: string; password?: string } = {},
) {
  const email = overrides.email ?? `user-${Date.now()}@test.com`;
  const username = overrides.username ?? `user-${Date.now()}`;
  const password = overrides.password ?? "testpassword123";

  const regRes = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, password },
  });

  const regBody = regRes.json();

  // Login to get a token
  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });

  const loginBody = loginRes.json();

  return {
    user: regBody.user,
    token: loginBody.token as string,
    email,
    username,
    password,
  };
}

/** Create a campaign and return it. */
export async function createCampaign(
  app: FastifyInstance,
  token: string,
  overrides: { name?: string; ruleset?: string } = {},
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      name: overrides.name ?? "Test Campaign",
      ruleset: overrides.ruleset ?? "dnd5e",
    },
  });
  return res.json().campaign;
}

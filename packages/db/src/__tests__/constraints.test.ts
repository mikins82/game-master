import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/game_master";

describe("database constraints & indexes (requires running Postgres)", () => {
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;

  // Reusable test user + campaign ids
  let userId: string;
  let campaignId: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool, { schema });

    // Ensure we have a test user and campaign for constraint tests
    const [user] = await db
      .insert(schema.appUser)
      .values({
        email: `test-${Date.now()}@constraint.test`,
        username: `constraintuser-${Date.now()}`,
        passwordHash: "test-hash",
      })
      .returning();
    userId = user.id;

    const [camp] = await db
      .insert(schema.campaign)
      .values({
        name: "Constraint Test Campaign",
        ruleset: "dnd5e",
        ownerId: userId,
      })
      .returning();
    campaignId = camp.id;
  });

  afterAll(async () => {
    // Clean up test data (cascade deletes will handle related rows)
    if (userId) {
      await db.delete(schema.appUser).where(sql`id = ${userId}`);
    }
    await pool.end();
  });

  // --------------------------------------------------------------------------
  // game_event(campaign_id, seq) uniqueness
  // --------------------------------------------------------------------------
  it("should reject duplicate game_event(campaign_id, seq) pairs", async () => {
    // Insert first event — should succeed
    await db.insert(schema.gameEvent).values({
      campaignId,
      seq: 99999,
      eventName: "player_action",
      payload: { text: "first" },
    });

    // Insert duplicate seq for the same campaign — should fail
    await expect(
      db.insert(schema.gameEvent).values({
        campaignId,
        seq: 99999,
        eventName: "player_action",
        payload: { text: "duplicate" },
      }),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  // --------------------------------------------------------------------------
  // game_snapshot one-per-campaign
  // --------------------------------------------------------------------------
  it("should reject duplicate game_snapshot per campaign", async () => {
    await db.insert(schema.gameSnapshot).values({
      campaignId,
      lastSeq: 0,
      snapshot: { mode: "free" },
    });

    await expect(
      db.insert(schema.gameSnapshot).values({
        campaignId,
        lastSeq: 1,
        snapshot: { mode: "free" },
      }),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  // --------------------------------------------------------------------------
  // campaign_player uniqueness
  // --------------------------------------------------------------------------
  it("should reject duplicate campaign_player(campaign_id, user_id) pairs", async () => {
    await db.insert(schema.campaignPlayer).values({
      campaignId,
      userId,
      role: "dm",
    });

    await expect(
      db.insert(schema.campaignPlayer).values({
        campaignId,
        userId,
        role: "player",
      }),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  // --------------------------------------------------------------------------
  // Required indexes exist
  // --------------------------------------------------------------------------
  it("should have all required indexes", async () => {
    const result = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
       ORDER BY indexname`,
    );
    const indexNames = result.rows.map((r) => r.indexname);

    // game_event(campaign_id, seq)
    expect(indexNames).toContain("game_event_campaign_id_seq_uniq");

    // game_snapshot(campaign_id) unique
    expect(indexNames).toContain("game_snapshot_campaign_id_uniq");

    // rag_chunk(document_id)
    expect(indexNames).toContain("rag_chunk_document_id_idx");

    // rag_chunk.meta GIN
    expect(indexNames).toContain("rag_chunk_meta_gin_idx");

    // rag_chunk.embedding HNSW
    expect(indexNames).toContain("rag_chunk_embedding_hnsw_idx");

    // campaign_player uniqueness
    expect(indexNames).toContain("campaign_player_campaign_id_user_id_uniq");
  });
});

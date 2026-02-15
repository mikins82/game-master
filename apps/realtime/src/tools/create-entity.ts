import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateEntityResult = {
  entityRef: string; // "npc:<uuid>" | "location:<uuid>"
  name: string;
  data: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Entity creation
// ---------------------------------------------------------------------------

/**
 * Insert a new NPC or Location row in the database and return a reference.
 */
export async function createEntity(
  pool: Pool,
  campaignId: string,
  entityType: "npc" | "location",
  name: string,
  data: Record<string, unknown>,
): Promise<CreateEntityResult> {
  const table = entityType; // "npc" | "location"

  const res = await pool.query(
    `INSERT INTO "${table}" (campaign_id, name, data)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [campaignId, name, JSON.stringify(data)],
  );

  const id: string = res.rows[0].id;

  return {
    entityRef: `${entityType}:${id}`,
    name,
    data,
  };
}

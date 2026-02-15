import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

/**
 * Create a Drizzle ORM database instance backed by a node-postgres pool.
 * Returns both the Drizzle instance (`db`) and the underlying `pool`
 * so callers can shut the pool down on graceful exit.
 */
export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/** Drizzle database instance type (for downstream type annotations). */
export type Database = ReturnType<typeof createDb>["db"];

// ---------------------------------------------------------------------------
// Fastify plugin: Database (Drizzle + pg pool)
// ---------------------------------------------------------------------------

import { createDb, type Database } from "@game-master/db";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    dbPool: import("pg").Pool;
  }
}

export default fp(
  async function dbPlugin(app: FastifyInstance) {
    const { db, pool } = createDb(app.env.DATABASE_URL);

    app.decorate("db", db);
    app.decorate("dbPool", pool);

    app.addHook("onClose", async () => {
      await pool.end();
    });
  },
  { name: "db" },
);

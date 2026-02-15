import { createDb } from "@game-master/db";
import { env } from "./env.js";
import { createServer } from "./server.js";

async function main() {
  const { pool } = createDb(env.DATABASE_URL);
  const app = await createServer(pool);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down…");
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`Realtime server listening on port ${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

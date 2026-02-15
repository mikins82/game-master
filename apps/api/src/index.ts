// ---------------------------------------------------------------------------
// apps/api — production entry point
// ---------------------------------------------------------------------------

import "dotenv/config";
import { buildApp } from "./app.js";
import { loadEnv } from "./lib/env.js";

async function main() {
  const env = loadEnv();
  const app = await buildApp();

  await app.listen({ port: env.PORT, host: env.HOST });
  console.log(`[api] listening on ${env.HOST}:${env.PORT}`);
}

main().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});

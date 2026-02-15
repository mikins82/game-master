// ---------------------------------------------------------------------------
// @game-master/llm-orchestrator — Fastify server entry point
// ---------------------------------------------------------------------------

import Fastify from "fastify";
import pg from "pg";
import { loadConfig } from "./config.js";
import { LlmClient } from "./llm/openai-client.js";
import { registerOrchestrateRoute } from "./routes/orchestrate.js";

async function main() {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  // ---------------------------------------------------------------------------
  // Postgres pool for RAG queries (optional — gracefully skipped if unavailable)
  // ---------------------------------------------------------------------------
  let pool: pg.Pool | null = null;
  if (config.databaseUrl) {
    try {
      pool = new pg.Pool({ connectionString: config.databaseUrl });
      // Quick connectivity check
      await pool.query("SELECT 1");
      app.log.info("Connected to PostgreSQL for RAG retrieval");
    } catch (err) {
      app.log.warn({ err }, "PostgreSQL not available; RAG retrieval disabled");
      pool = null;
    }
  }

  // ---------------------------------------------------------------------------
  // LLM client
  // ---------------------------------------------------------------------------
  const llmClient = new LlmClient(config.openaiApiKey, config.model);

  if (!config.openaiApiKey) {
    app.log.warn(
      "OPENAI_API_KEY not set — LLM calls will fail. Set it to enable real orchestration.",
    );
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------
  registerOrchestrateRoute(app, config, llmClient, pool);

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    service: "llm-orchestrator",
  }));

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`LLM Orchestrator listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------
  const shutdown = async () => {
    app.log.info("Shutting down...");
    await app.close();
    if (pool) {
      await pool.end();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();

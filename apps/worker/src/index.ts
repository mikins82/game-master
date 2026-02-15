import { createDb } from "@game-master/db";
import OpenAI from "openai";
import pino from "pino";
import { env } from "./env.js";
import { startHealthServer } from "./health.js";
import { Embedder } from "./lib/embedder.js";
import { createIngestionWorker } from "./workers/ingestion.worker.js";
import { createSummaryWorker } from "./workers/summary.worker.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const logger = pino({ level: env.LOG_LEVEL });

logger.info("Starting Game Master worker service");

// -- Database ---------------------------------------------------------------
const { db, pool } = createDb(env.DATABASE_URL);

// -- Redis connection options for BullMQ ------------------------------------
const redisUrl = new URL(env.REDIS_URL);
const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
};

// -- OpenAI / Embedder ------------------------------------------------------
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const embedder = new Embedder({
  apiKey: env.OPENAI_API_KEY,
  model: env.EMBEDDING_MODEL,
});

// -- Workers ----------------------------------------------------------------
const ingestionWorker = createIngestionWorker(redisConnection, {
  db,
  embedder,
  logger,
});

const summaryWorker = createSummaryWorker(redisConnection, {
  db,
  openai,
  model: env.SUMMARY_MODEL,
  logger,
});

// -- Health-check HTTP server -----------------------------------------------
const healthPort = Number(env.WORKER_HEALTH_PORT) || 8084;
const healthServer = startHealthServer(healthPort);
logger.info(`Worker health check on port ${healthPort}`);

logger.info("All workers started");

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
async function shutdown() {
  logger.info("Shutting down workers…");

  healthServer.close();

  await Promise.allSettled([ingestionWorker.close(), summaryWorker.close()]);

  await pool.end();

  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

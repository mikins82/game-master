import "dotenv/config";

export const env = {
  /** PostgreSQL connection string */
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/game_master",

  /** Redis connection string */
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",

  /** OpenAI API key for embeddings + summarisation */
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",

  /** Embedding model (must produce 1536-dim vectors) */
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",

  /** Chat model for campaign summaries */
  SUMMARY_MODEL: process.env.SUMMARY_MODEL ?? "gpt-4o-mini",

  /** Max concurrent ingestion jobs */
  INGESTION_CONCURRENCY: Number(process.env.INGESTION_CONCURRENCY ?? "2"),

  /** Max concurrent summary jobs */
  SUMMARY_CONCURRENCY: Number(process.env.SUMMARY_CONCURRENCY ?? "1"),

  /** Log level */
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",

  /** Port for the worker health-check HTTP server */
  WORKER_HEALTH_PORT: process.env.WORKER_HEALTH_PORT ?? "8084",
} as const;

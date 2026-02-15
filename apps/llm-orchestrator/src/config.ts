// ---------------------------------------------------------------------------
// @game-master/llm-orchestrator — environment config
// ---------------------------------------------------------------------------

export interface OrchestratorConfig {
  /** Port the orchestrator server listens on */
  port: number;
  /** Host to bind to */
  host: string;
  /** OpenAI API key (required for real LLM calls) */
  openaiApiKey: string;
  /** Model to use for DM turn generation */
  model: string;
  /** Max recent events to include in context */
  maxRecentEvents: number;
  /** Max RAG chunks to retrieve per turn */
  maxRagChunks: number;
  /** PostgreSQL connection string (for RAG queries) */
  databaseUrl: string;
  /** Internal shared secret for service auth */
  internalSecret: string;
  /** Log level */
  logLevel: string;
}

export function loadConfig(): OrchestratorConfig {
  return {
    port: parseInt(process.env.ORCHESTRATOR_PORT ?? "8083", 10),
    host: process.env.ORCHESTRATOR_HOST ?? "0.0.0.0",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    maxRecentEvents: parseInt(process.env.MAX_RECENT_EVENTS ?? "20", 10),
    maxRagChunks: parseInt(process.env.MAX_RAG_CHUNKS ?? "6", 10),
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/game_master",
    internalSecret: process.env.INTERNAL_SECRET ?? "dev-internal-secret",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}

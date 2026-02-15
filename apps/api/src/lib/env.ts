// ---------------------------------------------------------------------------
// Environment configuration for apps/api
// ---------------------------------------------------------------------------

export interface AppEnv {
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  AUTH_MODE: "dev" | "prod";
  PORT: number;
  HOST: string;
}

export function loadEnv(): AppEnv {
  return {
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5433/game_master",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
    AUTH_MODE: (process.env.AUTH_MODE as "dev" | "prod") ?? "dev",
    PORT: Number(process.env.PORT) || 3001,
    HOST: process.env.HOST ?? "0.0.0.0",
  };
}

import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8082),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5432/game_master"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
  AUTH_MODE: z.enum(["dev", "production"]).default("dev"),
  ORCHESTRATOR_URL: z.string().default("http://localhost:8083"),
  INTERNAL_SECRET: z.string().default("dev-internal-secret"),
  DICE_SIGNING_SECRET: z.string().default("dev-dice-signing-secret"),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;

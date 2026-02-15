// ---------------------------------------------------------------------------
// Fastify app factory — used by both production entry point and tests
// ---------------------------------------------------------------------------

import cors from "@fastify/cors";
import { Queue } from "bullmq";
import Fastify, { type FastifyInstance } from "fastify";
import { type AppEnv, loadEnv } from "./lib/env.js";
import { AppError } from "./lib/errors.js";
import authPlugin from "./plugins/auth.js";
import dbPlugin from "./plugins/db.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import authRoutes from "./routes/auth.js";
import campaignRoutes from "./routes/campaigns.js";
import characterRoutes from "./routes/characters.js";
import uploadRoutes from "./routes/uploads.js";
import wsTokenRoute from "./routes/ws-token.js";

declare module "fastify" {
  interface FastifyInstance {
    env: AppEnv;
    ingestionQueue: Queue | null;
  }
}

export interface BuildAppOptions {
  /** Override default env (useful for tests) */
  env?: Partial<AppEnv>;
  /** Disable BullMQ queue connection (useful for tests) */
  disableQueue?: boolean;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const env: AppEnv = { ...loadEnv(), ...options.env };

  const app = Fastify({ logger: false });

  // Decorate env so plugins can access it
  app.decorate("env", env);

  // CORS
  await app.register(cors, { origin: true });

  // BullMQ ingestion queue (optional)
  let ingestionQueue: Queue | null = null;
  if (!options.disableQueue) {
    try {
      ingestionQueue = new Queue("ingestion", {
        connection: { url: env.REDIS_URL },
      });
    } catch {
      // Queue connection failure is non-fatal for API startup
      app.log.warn?.("Failed to connect BullMQ ingestion queue");
    }
  }
  app.decorate("ingestionQueue", ingestionQueue);

  // Plugins
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);
  await app.register(dbPlugin);

  // Routes
  await app.register(authRoutes);
  await app.register(campaignRoutes);
  await app.register(characterRoutes);
  await app.register(wsTokenRoute);
  await app.register(uploadRoutes);

  // Health check
  app.get("/api/health", async () => ({ status: "ok" }));

  // Global error handler
  app.setErrorHandler(
    (error: Error & { statusCode?: number }, _request, reply) => {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      // Fastify JWT errors
      if (error.statusCode === 401) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      app.log.error?.(error);
      return reply
        .status(error.statusCode ?? 500)
        .send({ error: error.message ?? "Internal server error" });
    },
  );

  // Graceful shutdown: close queue
  app.addHook("onClose", async () => {
    if (ingestionQueue) {
      await ingestionQueue.close();
    }
  });

  return app;
}

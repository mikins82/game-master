import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import type { Pool } from "pg";
import { handleConnection } from "./ws/handler.js";

/**
 * Create and configure the Fastify server with WebSocket support.
 */
export async function createServer(pool: Pool) {
  const app = Fastify({ logger: true });

  await app.register(fastifyWebsocket);

  // Health check
  app.get("/health", async () => ({
    ok: true,
    service: "realtime",
    timestamp: new Date().toISOString(),
  }));

  // WebSocket endpoint
  app.get("/ws", { websocket: true }, (socket) => {
    handleConnection(pool, socket);
  });

  return app;
}

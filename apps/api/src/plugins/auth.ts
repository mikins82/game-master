// ---------------------------------------------------------------------------
// Fastify plugin: JWT auth + dev-mode bypass
// ---------------------------------------------------------------------------

import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; username: string };
    user: { sub: string; username: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    env: import("../lib/env.js").AppEnv;
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

export default fp(
  async function authPlugin(app: FastifyInstance) {
    await app.register(fastifyJwt, {
      secret: app.env.JWT_SECRET,
      sign: { expiresIn: "7d" },
    });

    app.decorate(
      "authenticate",
      async function (request: FastifyRequest, reply: FastifyReply) {
        // Dev-mode bypass: accept x-dev-user-id header
        if (app.env.AUTH_MODE === "dev") {
          const devUserId = request.headers["x-dev-user-id"];
          if (typeof devUserId === "string" && devUserId.length > 0) {
            (request as any).user = {
              sub: devUserId,
              username: "dev-user",
            };
            return;
          }
        }

        try {
          await request.jwtVerify();
        } catch {
          reply.status(401).send({ error: "Unauthorized" });
        }
      },
    );
  },
  { name: "auth", dependencies: [] },
);

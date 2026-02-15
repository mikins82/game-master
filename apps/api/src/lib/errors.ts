// ---------------------------------------------------------------------------
// Shared API error helpers
// ---------------------------------------------------------------------------

import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function sendZodError(reply: FastifyReply, error: ZodError) {
  return reply.status(400).send({
    error: "Validation failed",
    details: error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  });
}

export function sendAppError(reply: FastifyReply, error: AppError) {
  return reply.status(error.statusCode).send({ error: error.message });
}

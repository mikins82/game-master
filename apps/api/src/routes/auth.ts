// ---------------------------------------------------------------------------
// Auth routes: register, login, refresh
// ---------------------------------------------------------------------------

import { appUser } from "@game-master/db";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, sendZodError } from "../lib/errors.js";

const SALT_ROUNDS = 10;

const RegisterBody = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(128),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default async function authRoutes(app: FastifyInstance) {
  // -----------------------------------------------------------------
  // POST /api/auth/register
  // -----------------------------------------------------------------
  app.post("/api/auth/register", async (request, reply) => {
    const parsed = RegisterBody.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    const { email, username, password } = parsed.data;

    // Check for existing user
    const existing = await app.db.query.appUser.findFirst({
      where: eq(appUser.email, email),
    });
    if (existing) {
      throw new AppError(409, "Email already registered");
    }

    const existingUsername = await app.db.query.appUser.findFirst({
      where: eq(appUser.username, username),
    });
    if (existingUsername) {
      throw new AppError(409, "Username already taken");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [user] = await app.db
      .insert(appUser)
      .values({ email, username, passwordHash })
      .returning({
        id: appUser.id,
        email: appUser.email,
        username: appUser.username,
        createdAt: appUser.createdAt,
      });

    // Sign a JWT so the client can auto-login after registration
    const token = app.jwt.sign({ sub: user.id, username: user.username });

    return reply.status(201).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  });

  // -----------------------------------------------------------------
  // POST /api/auth/login
  // -----------------------------------------------------------------
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    const { email, password } = parsed.data;

    const user = await app.db.query.appUser.findFirst({
      where: eq(appUser.email, email),
    });
    if (!user) {
      throw new AppError(401, "Invalid credentials");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, "Invalid credentials");
    }

    const token = app.jwt.sign({ sub: user.id, username: user.username });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  });

  // -----------------------------------------------------------------
  // POST /api/auth/refresh
  // -----------------------------------------------------------------
  app.post(
    "/api/auth/refresh",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { sub, username } = request.user;

      // Verify user still exists
      const user = await app.db.query.appUser.findFirst({
        where: eq(appUser.id, sub),
      });
      if (!user) {
        throw new AppError(401, "User not found");
      }

      const token = app.jwt.sign({ sub, username });
      return reply.send({ token });
    },
  );
}

// ---------------------------------------------------------------------------
// Character routes: create, update, list (scoped to user + campaign)
// ---------------------------------------------------------------------------

import { campaignPlayer, character } from "@game-master/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, sendZodError } from "../lib/errors.js";

const CreateCharacterBody = z.object({
  campaign_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  data: z.record(z.unknown()).default({}),
});

const UpdateCharacterBody = z.object({
  name: z.string().min(1).max(100).optional(),
  data: z.record(z.unknown()).optional(),
});

const CharacterIdParam = z.object({
  id: z.string().uuid(),
});

const ListCharactersQuery = z.object({
  campaign_id: z.string().uuid(),
});

export default async function characterRoutes(app: FastifyInstance) {
  // All character routes require authentication
  app.addHook("onRequest", app.authenticate);

  // -----------------------------------------------------------------
  // POST /api/characters
  // -----------------------------------------------------------------
  app.post("/api/characters", async (request, reply) => {
    const parsed = CreateCharacterBody.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    const { campaign_id, name, data } = parsed.data;
    const userId = request.user.sub;

    // Verify user is a member of the campaign
    const membership = await app.db.query.campaignPlayer.findFirst({
      where: and(
        eq(campaignPlayer.campaignId, campaign_id),
        eq(campaignPlayer.userId, userId),
      ),
    });
    if (!membership) {
      throw new AppError(403, "Not a member of this campaign");
    }

    const [char] = await app.db
      .insert(character)
      .values({
        campaignId: campaign_id,
        userId,
        name,
        data,
      })
      .returning();

    return reply.status(201).send({ character: char });
  });

  // -----------------------------------------------------------------
  // PATCH /api/characters/:id
  // -----------------------------------------------------------------
  app.patch("/api/characters/:id", async (request, reply) => {
    const paramParsed = CharacterIdParam.safeParse(request.params);
    if (!paramParsed.success) return sendZodError(reply, paramParsed.error);

    const bodyParsed = UpdateCharacterBody.safeParse(request.body);
    if (!bodyParsed.success) return sendZodError(reply, bodyParsed.error);

    const { id } = paramParsed.data;
    const updates = bodyParsed.data;
    const userId = request.user.sub;

    // Verify ownership
    const existing = await app.db.query.character.findFirst({
      where: and(eq(character.id, id), eq(character.userId, userId)),
    });
    if (!existing) {
      throw new AppError(404, "Character not found");
    }

    const setValues: Record<string, unknown> = {};
    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.data !== undefined) setValues.data = updates.data;

    if (Object.keys(setValues).length === 0) {
      return reply.send({ character: existing });
    }

    const [updated] = await app.db
      .update(character)
      .set(setValues)
      .where(eq(character.id, id))
      .returning();

    return reply.send({ character: updated });
  });

  // -----------------------------------------------------------------
  // GET /api/characters?campaign_id=...
  // -----------------------------------------------------------------
  app.get("/api/characters", async (request, reply) => {
    const parsed = ListCharactersQuery.safeParse(request.query);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    const { campaign_id } = parsed.data;
    const userId = request.user.sub;

    // Verify user is a member
    const membership = await app.db.query.campaignPlayer.findFirst({
      where: and(
        eq(campaignPlayer.campaignId, campaign_id),
        eq(campaignPlayer.userId, userId),
      ),
    });
    if (!membership) {
      throw new AppError(403, "Not a member of this campaign");
    }

    const characters = await app.db.query.character.findMany({
      where: eq(character.campaignId, campaign_id),
    });

    return reply.send({ characters });
  });
}

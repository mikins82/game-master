// ---------------------------------------------------------------------------
// Campaign routes: create, list, get, join
// ---------------------------------------------------------------------------

import { campaign, campaignPlayer, gameSnapshot } from "@game-master/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, sendZodError } from "../lib/errors.js";

const CreateCampaignBody = z.object({
  name: z.string().min(1).max(200),
  ruleset: z.string().min(1).max(50).default("dnd5e"),
});

const CampaignIdParam = z.object({
  id: z.string().uuid(),
});

export default async function campaignRoutes(app: FastifyInstance) {
  // All campaign routes require authentication
  app.addHook("onRequest", app.authenticate);

  // -----------------------------------------------------------------
  // POST /api/campaigns
  // -----------------------------------------------------------------
  app.post("/api/campaigns", async (request, reply) => {
    const parsed = CreateCampaignBody.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    const { name, ruleset } = parsed.data;
    const userId = request.user.sub;

    const [camp] = await app.db
      .insert(campaign)
      .values({ name, ruleset, ownerId: userId })
      .returning();

    // Auto-add the creator as DM
    await app.db.insert(campaignPlayer).values({
      campaignId: camp.id,
      userId,
      role: "dm",
    });

    // Create initial game snapshot
    await app.db.insert(gameSnapshot).values({
      campaignId: camp.id,
      lastSeq: 0,
      snapshot: {
        campaign_id: camp.id,
        ruleset,
        mode: "free",
        scene_summary: "",
        rules_flags: { strictness: "standard" },
      },
    });

    return reply.status(201).send({ campaign: camp });
  });

  // -----------------------------------------------------------------
  // GET /api/campaigns
  // -----------------------------------------------------------------
  app.get("/api/campaigns", async (request, reply) => {
    const userId = request.user.sub;

    // Return campaigns the user is a member of
    const memberships = await app.db.query.campaignPlayer.findMany({
      where: eq(campaignPlayer.userId, userId),
    });

    if (memberships.length === 0) {
      return reply.send({ campaigns: [] });
    }

    const campaignIds = memberships.map((m) => m.campaignId);
    const campaigns = await app.db.query.campaign.findMany({
      where: (c, { inArray }) => inArray(c.id, campaignIds),
    });

    return reply.send({ campaigns });
  });

  // -----------------------------------------------------------------
  // GET /api/campaigns/:id
  // -----------------------------------------------------------------
  app.get("/api/campaigns/:id", async (request, reply) => {
    const paramParsed = CampaignIdParam.safeParse(request.params);
    if (!paramParsed.success) return sendZodError(reply, paramParsed.error);

    const { id } = paramParsed.data;
    const userId = request.user.sub;

    const camp = await app.db.query.campaign.findFirst({
      where: eq(campaign.id, id),
    });
    if (!camp) {
      throw new AppError(404, "Campaign not found");
    }

    // Check membership
    const membership = await app.db.query.campaignPlayer.findFirst({
      where: and(
        eq(campaignPlayer.campaignId, id),
        eq(campaignPlayer.userId, userId),
      ),
    });
    if (!membership) {
      throw new AppError(403, "Not a member of this campaign");
    }

    // Get players
    const players = await app.db.query.campaignPlayer.findMany({
      where: eq(campaignPlayer.campaignId, id),
    });

    return reply.send({ campaign: camp, players });
  });

  // -----------------------------------------------------------------
  // POST /api/campaigns/:id/join
  // -----------------------------------------------------------------
  app.post("/api/campaigns/:id/join", async (request, reply) => {
    const paramParsed = CampaignIdParam.safeParse(request.params);
    if (!paramParsed.success) return sendZodError(reply, paramParsed.error);

    const { id } = paramParsed.data;
    const userId = request.user.sub;

    const camp = await app.db.query.campaign.findFirst({
      where: eq(campaign.id, id),
    });
    if (!camp) {
      throw new AppError(404, "Campaign not found");
    }

    // Check if already a member
    const existing = await app.db.query.campaignPlayer.findFirst({
      where: and(
        eq(campaignPlayer.campaignId, id),
        eq(campaignPlayer.userId, userId),
      ),
    });
    if (existing) {
      return reply.send({ message: "Already a member", role: existing.role });
    }

    const [membership] = await app.db
      .insert(campaignPlayer)
      .values({ campaignId: id, userId, role: "player" })
      .returning();

    return reply.send({
      message: "Joined campaign",
      role: membership.role,
    });
  });
}

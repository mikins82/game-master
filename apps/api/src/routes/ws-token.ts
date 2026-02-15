// ---------------------------------------------------------------------------
// WS token route: POST /api/ws-token
// Issues a short-lived JWT with user_id + campaign_id claims for WS auth
// ---------------------------------------------------------------------------

import { campaignPlayer } from "@game-master/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, sendZodError } from "../lib/errors.js";

const WsTokenBody = z.object({
  campaign_id: z.string().uuid(),
});

export default async function wsTokenRoute(app: FastifyInstance) {
  app.post(
    "/api/ws-token",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = WsTokenBody.safeParse(request.body);
      if (!parsed.success) return sendZodError(reply, parsed.error);

      const { campaign_id } = parsed.data;
      const userId = request.user.sub;

      // Verify membership
      const membership = await app.db.query.campaignPlayer.findFirst({
        where: and(
          eq(campaignPlayer.campaignId, campaign_id),
          eq(campaignPlayer.userId, userId),
        ),
      });
      if (!membership) {
        throw new AppError(403, "Not a member of this campaign");
      }

      // Issue a short-lived token (60 seconds) for WS handshake.
      // We cast the payload to bypass the strict JWT type — the WS token
      // carries additional claims (campaign_id, role, purpose) beyond the
      // standard auth payload.
      const wsPayload = {
        sub: userId,
        username: request.user.username,
        campaign_id,
        role: membership.role,
        purpose: "ws",
      } as unknown as { sub: string; username: string };
      const wsToken = app.jwt.sign(wsPayload, { expiresIn: "60s" });

      return reply.send({ token: wsToken });
    },
  );
}

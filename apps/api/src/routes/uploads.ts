// ---------------------------------------------------------------------------
// Upload route: POST /api/uploads
// Creates a rag_document row and queues a BullMQ ingestion job
// ---------------------------------------------------------------------------

import { campaignPlayer, ragDocument } from "@game-master/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, sendZodError } from "../lib/errors.js";

const UploadBody = z.object({
  campaign_id: z.string().uuid(),
  filename: z.string().min(1).max(500),
  content_type: z.string().min(1).max(200),
  file_url: z.string().url(),
  source: z.string().min(1).max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export default async function uploadRoutes(app: FastifyInstance) {
  app.post(
    "/api/uploads",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = UploadBody.safeParse(request.body);
      if (!parsed.success) return sendZodError(reply, parsed.error);

      const {
        campaign_id,
        filename,
        content_type,
        file_url,
        source,
        metadata,
      } = parsed.data;
      const userId = request.user.sub;

      // Verify membership (only DM can upload)
      const membership = await app.db.query.campaignPlayer.findFirst({
        where: and(
          eq(campaignPlayer.campaignId, campaign_id),
          eq(campaignPlayer.userId, userId),
        ),
      });
      if (!membership) {
        throw new AppError(403, "Not a member of this campaign");
      }
      if (membership.role !== "dm") {
        throw new AppError(403, "Only DMs can upload documents");
      }

      // Create rag_document row
      const [doc] = await app.db
        .insert(ragDocument)
        .values({
          campaignId: campaign_id,
          filename,
          mimeType: content_type,
          status: "pending",
          meta: metadata ?? {},
        })
        .returning();

      // Queue ingestion job via BullMQ (if queue is available)
      let jobId: string | undefined;
      if (app.ingestionQueue) {
        const job = await app.ingestionQueue.add("ingest", {
          documentId: doc.id,
          fileUrl: file_url,
          campaignId: campaign_id,
          metadata: {
            source: source ?? filename,
            ...(metadata ?? {}),
          },
        });
        jobId = job.id;
      }

      return reply.status(202).send({
        message: "Upload queued for processing",
        document_id: doc.id,
        job_id: jobId ?? null,
      });
    },
  );
}

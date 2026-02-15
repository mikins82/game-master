import {
  campaign,
  campaignSummary,
  gameEvent,
  type Database,
} from "@game-master/db";
import { Worker, type ConnectionOptions, type Job } from "bullmq";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import OpenAI from "openai";
import type { Logger } from "pino";
import { QUEUE_NAMES, type SummaryJobData } from "../queues.js";

// ---------------------------------------------------------------------------
// Campaign summary worker
// ---------------------------------------------------------------------------
// Summarises a range of game events into a concise campaign summary.
// ---------------------------------------------------------------------------

export interface SummaryWorkerDeps {
  db: Database;
  openai: OpenAI;
  model: string;
  logger: Logger;
}

/**
 * Build the summarisation prompt from a list of event rows.
 */
function buildPrompt(
  campaignName: string,
  events: { seq: number; eventName: string; payload: unknown }[],
): string {
  const eventLines = events
    .map((e) => `[seq ${e.seq}] ${e.eventName}: ${JSON.stringify(e.payload)}`)
    .join("\n");

  return [
    `You are summarising a tabletop RPG campaign called "${campaignName}".`,
    "Below is a sequence of game events. Write a concise narrative summary (2-4 paragraphs) capturing the key actions, dice outcomes, story developments, and any state changes.",
    "Focus on what happened, not the mechanical details. Write in past tense, third person.",
    "",
    "--- EVENTS ---",
    eventLines,
    "--- END EVENTS ---",
    "",
    "Summary:",
  ].join("\n");
}

/**
 * Process a single campaign summary job.
 * Exported separately for unit testing.
 */
export async function processSummaryJob(
  job: Job<SummaryJobData>,
  deps: SummaryWorkerDeps,
): Promise<void> {
  const { db, openai, model, logger } = deps;
  const { campaignId } = job.data;

  const log = logger.child({ jobId: job.id, campaignId });
  log.info("Starting campaign summary");

  // -------------------------------------------------------------------------
  // 1. Determine the event range
  // -------------------------------------------------------------------------

  // Find the last summary's toSeq (if any) to avoid re-summarising
  const [lastSummary] = await db
    .select({ toSeq: campaignSummary.toSeq })
    .from(campaignSummary)
    .where(eq(campaignSummary.campaignId, campaignId))
    .orderBy(desc(campaignSummary.toSeq))
    .limit(1);

  const fromSeq = job.data.fromSeq ?? (lastSummary ? lastSummary.toSeq + 1 : 1);

  // Determine toSeq — either provided or the latest event
  let toSeq = job.data.toSeq;
  if (toSeq === undefined) {
    const [latest] = await db
      .select({ seq: gameEvent.seq })
      .from(gameEvent)
      .where(eq(gameEvent.campaignId, campaignId))
      .orderBy(desc(gameEvent.seq))
      .limit(1);

    if (!latest) {
      log.info("No events found for campaign — skipping");
      return;
    }
    toSeq = latest.seq;
  }

  if (fromSeq > toSeq) {
    log.info({ fromSeq, toSeq }, "No new events to summarise");
    return;
  }

  await job.updateProgress(10);

  // -------------------------------------------------------------------------
  // 2. Fetch events in range
  // -------------------------------------------------------------------------
  const events = await db
    .select({
      seq: gameEvent.seq,
      eventName: gameEvent.eventName,
      payload: gameEvent.payload,
    })
    .from(gameEvent)
    .where(
      and(
        eq(gameEvent.campaignId, campaignId),
        gte(gameEvent.seq, fromSeq),
        lte(gameEvent.seq, toSeq),
      ),
    )
    .orderBy(asc(gameEvent.seq));

  if (events.length === 0) {
    log.info({ fromSeq, toSeq }, "No events found in range — skipping");
    return;
  }

  log.info({ fromSeq, toSeq, eventCount: events.length }, "Fetched events");
  await job.updateProgress(30);

  // -------------------------------------------------------------------------
  // 3. Get campaign name for prompt context
  // -------------------------------------------------------------------------
  const [campaignRow] = await db
    .select({ name: campaign.name })
    .from(campaign)
    .where(eq(campaign.id, campaignId))
    .limit(1);

  const campaignName = campaignRow?.name ?? "Unknown Campaign";

  // -------------------------------------------------------------------------
  // 4. Call the LLM for summarisation
  // -------------------------------------------------------------------------
  const prompt = buildPrompt(campaignName, events);

  log.info("Calling LLM for summarisation");
  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    max_tokens: 1024,
  });

  const summaryText = completion.choices[0]?.message?.content?.trim() ?? "";

  if (summaryText.length === 0) {
    log.warn("LLM returned empty summary");
    throw new Error("Empty summary from LLM");
  }

  await job.updateProgress(80);

  // -------------------------------------------------------------------------
  // 5. Persist the summary
  // -------------------------------------------------------------------------
  await db.insert(campaignSummary).values({
    campaignId,
    summary: summaryText,
    fromSeq,
    toSeq,
  });

  await job.updateProgress(100);
  log.info(
    { fromSeq, toSeq, summaryLength: summaryText.length },
    "Campaign summary complete",
  );
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createSummaryWorker(
  connection: ConnectionOptions,
  deps: SummaryWorkerDeps,
) {
  const worker = new Worker<SummaryJobData>(
    QUEUE_NAMES.SUMMARY,
    async (job) => processSummaryJob(job, deps),
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    deps.logger.info({ jobId: job.id }, "Summary job completed");
  });

  worker.on("failed", (job, err) => {
    deps.logger.error({ jobId: job?.id, err }, "Summary job failed");
  });

  return worker;
}

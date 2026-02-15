import type { ConnectionOptions } from "bullmq";
import { Queue } from "bullmq";

// ---------------------------------------------------------------------------
// Queue names (single source of truth)
// ---------------------------------------------------------------------------
export const QUEUE_NAMES = {
  INGESTION: "ingestion",
  SUMMARY: "campaign-summary",
} as const;

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

/** Metadata attached to every RAG chunk from an ingested document. */
export interface ChunkMeta {
  source?: string;
  type?: string; // e.g. "rules" | "lore" | "adventure" | "reference"
  edition?: string; // e.g. "5e"
  chapter?: string;
  page?: string;
}

/** Data for a document ingestion job. */
export interface IngestionJobData {
  /** rag_document.id (already inserted by the API upload route) */
  documentId: string;
  /** URL or local path to download the file from */
  fileUrl: string;
  /** Owning campaign (nullable — global docs have no campaign) */
  campaignId?: string;
  /** User-supplied metadata propagated to every chunk */
  metadata?: ChunkMeta;
}

/** Data for a campaign summary generation job. */
export interface SummaryJobData {
  /** campaign.id */
  campaignId: string;
  /** Start of the event range (inclusive). Defaults to last summary's toSeq+1. */
  fromSeq?: number;
  /** End of the event range (inclusive). Defaults to latest event seq. */
  toSeq?: number;
}

// ---------------------------------------------------------------------------
// Queue factory
// ---------------------------------------------------------------------------

export function createQueues(connection: ConnectionOptions) {
  const ingestionQueue = new Queue<IngestionJobData>(QUEUE_NAMES.INGESTION, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  });

  const summaryQueue = new Queue<SummaryJobData>(QUEUE_NAMES.SUMMARY, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });

  return { ingestionQueue, summaryQueue };
}

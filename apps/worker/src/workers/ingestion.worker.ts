import { ragChunk, ragDocument, type Database } from "@game-master/db";
import { Worker, type ConnectionOptions, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { chunkText } from "../lib/chunker.js";
import type { Embedder } from "../lib/embedder.js";
import { extractText } from "../lib/text-extractor.js";
import { QUEUE_NAMES, type IngestionJobData } from "../queues.js";

// ---------------------------------------------------------------------------
// Ingestion worker
// ---------------------------------------------------------------------------
// Pipeline: download → extract text → chunk → embed → persist
// ---------------------------------------------------------------------------

export interface IngestionWorkerDeps {
  db: Database;
  embedder: Embedder;
  logger: Logger;
  /** Override for downloading files (default: global fetch) */
  fetchFile?: (url: string) => Promise<Buffer>;
}

/**
 * Download a file from a URL and return its raw buffer.
 */
async function defaultFetchFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download file: ${response.status} ${response.statusText}`,
    );
  }
  const arrayBuf = await response.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Process a single ingestion job.
 * Exported separately so it can be unit-tested without starting a real worker.
 */
export async function processIngestionJob(
  job: Job<IngestionJobData>,
  deps: IngestionWorkerDeps,
): Promise<void> {
  const { db, embedder, logger } = deps;
  const fetchFile = deps.fetchFile ?? defaultFetchFile;
  const { documentId, fileUrl, metadata } = job.data;

  const log = logger.child({ jobId: job.id, documentId });
  log.info("Starting ingestion");

  // -------------------------------------------------------------------------
  // 1. Mark document as processing
  // -------------------------------------------------------------------------
  await db
    .update(ragDocument)
    .set({ status: "processing" })
    .where(eq(ragDocument.id, documentId));

  try {
    // -----------------------------------------------------------------------
    // 2. Download the file
    // -----------------------------------------------------------------------
    log.info({ fileUrl }, "Downloading file");
    const buffer = await fetchFile(fileUrl);
    await job.updateProgress(10);

    // -----------------------------------------------------------------------
    // 3. Lookup MIME type from the document row
    // -----------------------------------------------------------------------
    const [doc] = await db
      .select({ mimeType: ragDocument.mimeType })
      .from(ragDocument)
      .where(eq(ragDocument.id, documentId))
      .limit(1);

    if (!doc) {
      throw new Error(`rag_document not found: ${documentId}`);
    }

    // -----------------------------------------------------------------------
    // 4. Extract text
    // -----------------------------------------------------------------------
    log.info({ mimeType: doc.mimeType }, "Extracting text");
    const text = await extractText(buffer, doc.mimeType);
    await job.updateProgress(30);

    if (text.trim().length === 0) {
      log.warn("Extracted text is empty — marking as ready with no chunks");
      await db
        .update(ragDocument)
        .set({ status: "ready" })
        .where(eq(ragDocument.id, documentId));
      return;
    }

    // -----------------------------------------------------------------------
    // 5. Chunk
    // -----------------------------------------------------------------------
    log.info("Chunking text");
    const chunks = chunkText(text, { metadata });
    log.info({ chunkCount: chunks.length }, "Chunked");
    await job.updateProgress(50);

    // -----------------------------------------------------------------------
    // 6. Generate embeddings
    // -----------------------------------------------------------------------
    log.info("Generating embeddings");
    const embeddings = await embedder.embed(chunks.map((c) => c.content));
    await job.updateProgress(80);

    // -----------------------------------------------------------------------
    // 7. Persist chunks to rag_chunk
    // -----------------------------------------------------------------------
    log.info("Persisting chunks");
    if (chunks.length > 0) {
      const rows = chunks.map((chunk, i) => ({
        documentId,
        content: chunk.content,
        embedding: embeddings[i],
        meta: chunk.meta as Record<string, unknown>,
        chunkIndex: chunk.chunkIndex,
      }));

      // Insert in batches of 50 to avoid overly large queries
      const BATCH_SIZE = 50;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await db.insert(ragChunk).values(rows.slice(i, i + BATCH_SIZE));
      }
    }

    // -----------------------------------------------------------------------
    // 8. Mark document as ready
    // -----------------------------------------------------------------------
    await db
      .update(ragDocument)
      .set({ status: "ready" })
      .where(eq(ragDocument.id, documentId));

    await job.updateProgress(100);
    log.info({ chunkCount: chunks.length }, "Ingestion complete");
  } catch (error) {
    // Mark document as failed on error
    await db
      .update(ragDocument)
      .set({ status: "failed" })
      .where(eq(ragDocument.id, documentId));

    log.error({ err: error }, "Ingestion failed");
    throw error; // Re-throw so BullMQ handles retries
  }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createIngestionWorker(
  connection: ConnectionOptions,
  deps: IngestionWorkerDeps,
) {
  const worker = new Worker<IngestionJobData>(
    QUEUE_NAMES.INGESTION,
    async (job) => processIngestionJob(job, deps),
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => {
    deps.logger.info({ jobId: job.id }, "Ingestion job completed");
  });

  worker.on("failed", (job, err) => {
    deps.logger.error({ jobId: job?.id, err }, "Ingestion job failed");
  });

  return worker;
}

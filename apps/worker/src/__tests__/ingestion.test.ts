import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestionJobData } from "../queues.js";
import { processIngestionJob } from "../workers/ingestion.worker.js";

// ---------------------------------------------------------------------------
// Mock pdf-parse
// ---------------------------------------------------------------------------
vi.mock("pdf-parse", () => ({
  default: vi.fn().mockImplementation(async () => ({
    text: "PDF content paragraph one.\n\nPDF content paragraph two.\n\nPDF content paragraph three.",
    numpages: 1,
    info: {},
  })),
}));

// ---------------------------------------------------------------------------
// Mock OpenAI (used by Embedder)
// ---------------------------------------------------------------------------
const mockEmbedCreate = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    embeddings = { create: mockEmbedCreate };
  },
}));

// ---------------------------------------------------------------------------
// Database mock
// ---------------------------------------------------------------------------
function createMockDb() {
  const updateSet = vi.fn().mockReturnThis();
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const selectFrom = vi.fn().mockReturnThis();
  const selectWhere = vi.fn().mockReturnThis();
  const selectLimit = vi.fn().mockResolvedValue([{ mimeType: "text/plain" }]);
  const insertValues = vi.fn().mockResolvedValue(undefined);

  return {
    update: vi.fn().mockReturnValue({ set: updateSet }),
    select: vi.fn().mockReturnValue({ from: selectFrom }),
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    // Chain helpers
    _updateSet: updateSet,
    _updateWhere: updateWhere,
    _selectFrom: selectFrom,
    _selectWhere: selectWhere,
    _selectLimit: selectLimit,
    _insertValues: insertValues,
  };
}

function wireDbChain(db: ReturnType<typeof createMockDb>) {
  db._updateSet.mockReturnValue({ where: db._updateWhere });
  db._selectFrom.mockReturnValue({ where: db._selectWhere });
  db._selectWhere.mockReturnValue({ limit: db._selectLimit });
}

// ---------------------------------------------------------------------------
// Job mock
// ---------------------------------------------------------------------------
function createMockJob(data: IngestionJobData): Job<IngestionJobData> {
  return {
    id: "test-job-1",
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<IngestionJobData>;
}

// ---------------------------------------------------------------------------
// Embedder mock
// ---------------------------------------------------------------------------
function createMockEmbedder() {
  return {
    embed: vi.fn().mockResolvedValue([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
      [0.7, 0.8, 0.9],
    ]),
    embedOne: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  };
}

// ---------------------------------------------------------------------------
// Logger mock
// ---------------------------------------------------------------------------
function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processIngestionJob", () => {
  let db: ReturnType<typeof createMockDb>;
  let embedder: ReturnType<typeof createMockEmbedder>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    wireDbChain(db);
    embedder = createMockEmbedder();
    logger = createMockLogger();
  });

  it("processes a plain text file end-to-end", async () => {
    const fileContent =
      "Paragraph one about dragons.\n\nParagraph two about spells.";
    const fetchFile = vi.fn().mockResolvedValue(Buffer.from(fileContent));

    const job = createMockJob({
      documentId: "doc-1",
      fileUrl: "https://example.com/rulebook.txt",
      metadata: { source: "rulebook.txt", type: "rules", edition: "5e" },
    });

    await processIngestionJob(job, {
      db: db as any,
      embedder: embedder as any,
      logger: logger as any,
      fetchFile,
    });

    // Should mark document as processing first
    expect(db.update).toHaveBeenCalled();
    expect(db._updateSet).toHaveBeenCalledWith({ status: "processing" });

    // Should download the file
    expect(fetchFile).toHaveBeenCalledWith("https://example.com/rulebook.txt");

    // Should generate embeddings
    expect(embedder.embed).toHaveBeenCalledOnce();

    // Should insert chunks
    expect(db.insert).toHaveBeenCalled();

    // Should mark document as ready at the end
    expect(db._updateSet).toHaveBeenCalledWith({ status: "ready" });

    // Should report progress
    expect(job.updateProgress).toHaveBeenCalled();
  });

  it("processes a PDF file via pdf-parse", async () => {
    const fetchFile = vi.fn().mockResolvedValue(Buffer.from("fake-pdf"));

    // Override select to return PDF mime type
    db._selectLimit.mockResolvedValue([{ mimeType: "application/pdf" }]);

    const job = createMockJob({
      documentId: "doc-2",
      fileUrl: "https://example.com/rules.pdf",
      metadata: { source: "rules.pdf", type: "rules" },
    });

    await processIngestionJob(job, {
      db: db as any,
      embedder: embedder as any,
      logger: logger as any,
      fetchFile,
    });

    expect(fetchFile).toHaveBeenCalledWith("https://example.com/rules.pdf");
    expect(embedder.embed).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalled();
    expect(db._updateSet).toHaveBeenCalledWith({ status: "ready" });
  });

  it("marks document as ready with no chunks for empty text", async () => {
    const fetchFile = vi.fn().mockResolvedValue(Buffer.from("   "));

    const job = createMockJob({
      documentId: "doc-3",
      fileUrl: "https://example.com/empty.txt",
    });

    await processIngestionJob(job, {
      db: db as any,
      embedder: embedder as any,
      logger: logger as any,
      fetchFile,
    });

    // Should not generate embeddings or insert chunks
    expect(embedder.embed).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();

    // Should still mark as ready
    expect(db._updateSet).toHaveBeenCalledWith({ status: "ready" });
  });

  it("marks document as failed and rethrows on error", async () => {
    const fetchFile = vi.fn().mockRejectedValue(new Error("Network error"));

    const job = createMockJob({
      documentId: "doc-4",
      fileUrl: "https://example.com/broken.txt",
    });

    await expect(
      processIngestionJob(job, {
        db: db as any,
        embedder: embedder as any,
        logger: logger as any,
        fetchFile,
      }),
    ).rejects.toThrow("Network error");

    // Should mark as failed
    expect(db._updateSet).toHaveBeenCalledWith({ status: "failed" });
  });

  it("marks document as failed when document not found", async () => {
    const fetchFile = vi.fn().mockResolvedValue(Buffer.from("content"));
    db._selectLimit.mockResolvedValue([]); // No document found

    const job = createMockJob({
      documentId: "nonexistent",
      fileUrl: "https://example.com/file.txt",
    });

    await expect(
      processIngestionJob(job, {
        db: db as any,
        embedder: embedder as any,
        logger: logger as any,
        fetchFile,
      }),
    ).rejects.toThrow("rag_document not found");

    expect(db._updateSet).toHaveBeenCalledWith({ status: "failed" });
  });

  it("propagates metadata to chunks", async () => {
    const fileContent = "A paragraph about combat rules and initiative order.";
    const fetchFile = vi.fn().mockResolvedValue(Buffer.from(fileContent));

    embedder.embed.mockResolvedValue([[0.1, 0.2]]);

    const job = createMockJob({
      documentId: "doc-5",
      fileUrl: "https://example.com/combat.txt",
      metadata: {
        source: "phb.pdf",
        type: "rules",
        edition: "5e",
        chapter: "9",
        page: "189",
      },
    });

    await processIngestionJob(job, {
      db: db as any,
      embedder: embedder as any,
      logger: logger as any,
      fetchFile,
    });

    // Verify the insert received correct metadata
    const insertCall = db._insertValues.mock.calls[0][0];
    expect(insertCall[0].meta).toEqual({
      source: "phb.pdf",
      type: "rules",
      edition: "5e",
      chapter: "9",
      page: "189",
    });
  });

  it("reports progress through the job lifecycle", async () => {
    const fetchFile = vi.fn().mockResolvedValue(Buffer.from("Some content"));
    embedder.embed.mockResolvedValue([[0.1]]);

    const job = createMockJob({
      documentId: "doc-6",
      fileUrl: "https://example.com/file.txt",
    });

    await processIngestionJob(job, {
      db: db as any,
      embedder: embedder as any,
      logger: logger as any,
      fetchFile,
    });

    // Should report progress at multiple stages
    const progressCalls = (
      job.updateProgress as ReturnType<typeof vi.fn>
    ).mock.calls.map((c) => c[0]);
    expect(progressCalls).toContain(10);
    expect(progressCalls).toContain(30);
    expect(progressCalls).toContain(50);
    expect(progressCalls).toContain(80);
    expect(progressCalls).toContain(100);
  });
});

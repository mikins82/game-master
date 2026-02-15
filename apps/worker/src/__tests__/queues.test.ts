import { describe, expect, it, vi } from "vitest";
import { QUEUE_NAMES, createQueues } from "../queues.js";

// ---------------------------------------------------------------------------
// Mock BullMQ so we don't need a real Redis connection
// ---------------------------------------------------------------------------
vi.mock("bullmq", () => {
  return {
    Queue: vi.fn().mockImplementation((name: string, opts: any) => ({
      name,
      opts,
      add: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
      close: vi.fn().mockResolvedValue(undefined),
    })),
    Worker: vi.fn(),
  };
});

describe("QUEUE_NAMES", () => {
  it("defines the ingestion queue name", () => {
    expect(QUEUE_NAMES.INGESTION).toBe("ingestion");
  });

  it("defines the summary queue name", () => {
    expect(QUEUE_NAMES.SUMMARY).toBe("campaign-summary");
  });
});

describe("createQueues", () => {
  it("creates ingestion and summary queues", () => {
    const { ingestionQueue, summaryQueue } = createQueues({
      host: "localhost",
      port: 6379,
    });

    expect(ingestionQueue).toBeDefined();
    expect(ingestionQueue.name).toBe("ingestion");
    expect(summaryQueue).toBeDefined();
    expect(summaryQueue.name).toBe("campaign-summary");
  });

  it("configures retry policies on ingestion queue", () => {
    const { ingestionQueue } = createQueues({ host: "localhost", port: 6379 });
    const opts = (ingestionQueue as any).opts;

    expect(opts.defaultJobOptions.attempts).toBe(3);
    expect(opts.defaultJobOptions.backoff.type).toBe("exponential");
  });

  it("configures retry policies on summary queue", () => {
    const { summaryQueue } = createQueues({ host: "localhost", port: 6379 });
    const opts = (summaryQueue as any).opts;

    expect(opts.defaultJobOptions.attempts).toBe(2);
    expect(opts.defaultJobOptions.backoff.type).toBe("exponential");
  });
});

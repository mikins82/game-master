import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SummaryJobData } from "../queues.js";
import { processSummaryJob } from "../workers/summary.worker.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockOpenAI(
  summaryText = "The party ventured into the dungeon.",
) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: { content: summaryText },
            },
          ],
        }),
      },
    },
  };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function createMockJob(data: SummaryJobData): Job<SummaryJobData> {
  return {
    id: "summary-job-1",
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<SummaryJobData>;
}

// ---------------------------------------------------------------------------
// DB mock (more sophisticated — multiple select chains)
// ---------------------------------------------------------------------------

interface MockDbConfig {
  lastSummaryToSeq?: number | null;
  latestEventSeq?: number | null;
  events?: { seq: number; eventName: string; payload: unknown }[];
  campaignName?: string;
}

function createMockDb(config: MockDbConfig = {}) {
  const {
    lastSummaryToSeq = null,
    latestEventSeq = 10,
    events = [
      {
        seq: 1,
        eventName: "player_action",
        payload: { text: "I attack the goblin" },
      },
      {
        seq: 2,
        eventName: "roll_result",
        payload: { formula: "1d20+5", total: 18 },
      },
      {
        seq: 3,
        eventName: "dm_narration",
        payload: { text: "The goblin falls!" },
      },
    ],
    campaignName = "Lost Mines of Phandelver",
  } = config;

  let selectCallIndex = 0;

  const insertValues = vi.fn().mockResolvedValue(undefined);

  // Each select().from() call returns a different chain depending on call order:
  // 1st: lastSummary query (with orderBy + limit)
  // 2nd: latestEvent query (with orderBy + limit) — only if toSeq not provided
  // 3rd: events query (with orderBy — returns array)
  // 4th: campaign name query (with limit)

  const db = {
    select: vi.fn().mockImplementation(() => {
      const callIdx = selectCallIndex++;

      const buildChain = (finalResult: unknown) => {
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockReturnValue(chain);
        chain.orderBy = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockResolvedValue(finalResult);
        // For the events query that doesn't use limit
        chain.then = (resolve: Function) => resolve(finalResult);
        return chain;
      };

      switch (callIdx) {
        case 0: // last summary
          return buildChain(
            lastSummaryToSeq !== null ? [{ toSeq: lastSummaryToSeq }] : [],
          );
        case 1: // latest event (or events list)
          if (latestEventSeq !== null) {
            return buildChain([{ seq: latestEventSeq }]);
          }
          return buildChain([]);
        case 2: // events in range
          return buildChain(events);
        case 3: // campaign name
          return buildChain([{ name: campaignName }]);
        default:
          return buildChain([]);
      }
    }),
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    _insertValues: insertValues,
  };

  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processSummaryJob", () => {
  let openai: ReturnType<typeof createMockOpenAI>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    openai = createMockOpenAI();
    logger = createMockLogger();
  });

  it("summarises events and persists the summary", async () => {
    const db = createMockDb();
    const job = createMockJob({ campaignId: "campaign-1" });

    await processSummaryJob(job, {
      db: db as any,
      openai: openai as any,
      model: "gpt-4o-mini",
      logger: logger as any,
    });

    // Should call the LLM
    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
    const createCall = openai.chat.completions.create.mock.calls[0][0];
    expect(createCall.model).toBe("gpt-4o-mini");
    expect(createCall.messages[0].content).toContain(
      "Lost Mines of Phandelver",
    );

    // Should insert the summary
    expect(db.insert).toHaveBeenCalled();
    const insertCall = db._insertValues.mock.calls[0][0];
    expect(insertCall.campaignId).toBe("campaign-1");
    expect(insertCall.summary).toBe("The party ventured into the dungeon.");
    expect(insertCall.fromSeq).toBeDefined();
    expect(insertCall.toSeq).toBeDefined();
  });

  it("uses fromSeq from the last summary when available", async () => {
    const db = createMockDb({ lastSummaryToSeq: 5 });
    const job = createMockJob({ campaignId: "campaign-1" });

    await processSummaryJob(job, {
      db: db as any,
      openai: openai as any,
      model: "gpt-4o-mini",
      logger: logger as any,
    });

    // fromSeq should be lastSummaryToSeq + 1 = 6
    const insertCall = db._insertValues.mock.calls[0][0];
    expect(insertCall.fromSeq).toBe(6);
  });

  it("uses explicit fromSeq/toSeq from job data when provided", async () => {
    const db = createMockDb({ lastSummaryToSeq: 2 });
    const job = createMockJob({
      campaignId: "campaign-1",
      fromSeq: 3,
      toSeq: 8,
    });

    // When toSeq is explicit, skip the latestEvent query
    // So select call order: lastSummary, events, campaign
    let callIdx = 0;
    db.select.mockImplementation(() => {
      const idx = callIdx++;
      const buildChain = (result: unknown) => {
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockReturnValue(chain);
        chain.orderBy = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockResolvedValue(result);
        chain.then = (resolve: Function) => resolve(result);
        return chain;
      };

      switch (idx) {
        case 0:
          return buildChain([{ toSeq: 2 }]); // last summary
        case 1:
          return buildChain([
            // events
            {
              seq: 3,
              eventName: "player_action",
              payload: { text: "I search the room" },
            },
          ]);
        case 2:
          return buildChain([{ name: "Test Campaign" }]); // campaign
        default:
          return buildChain([]);
      }
    });

    await processSummaryJob(job, {
      db: db as any,
      openai: openai as any,
      model: "gpt-4o-mini",
      logger: logger as any,
    });

    const insertCall = db._insertValues.mock.calls[0][0];
    expect(insertCall.fromSeq).toBe(3);
    expect(insertCall.toSeq).toBe(8);
  });

  it("skips when no events exist for the campaign", async () => {
    const db = createMockDb({ latestEventSeq: null });

    // Override: first call returns no last summary, second returns no events
    let callIdx = 0;
    db.select.mockImplementation(() => {
      const idx = callIdx++;
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([]);
      chain.then = (resolve: Function) => resolve([]);
      return chain;
    });

    const job = createMockJob({ campaignId: "campaign-empty" });

    await processSummaryJob(job, {
      db: db as any,
      openai: openai as any,
      model: "gpt-4o-mini",
      logger: logger as any,
    });

    // Should not call the LLM or insert anything
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips when fromSeq > toSeq (no new events)", async () => {
    const db = createMockDb({ lastSummaryToSeq: 10, latestEventSeq: 10 });
    const job = createMockJob({ campaignId: "campaign-1" });

    await processSummaryJob(job, {
      db: db as any,
      openai: openai as any,
      model: "gpt-4o-mini",
      logger: logger as any,
    });

    // fromSeq = 11 > toSeq = 10 → skip
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("throws when LLM returns empty summary", async () => {
    const db = createMockDb();
    openai = createMockOpenAI("");

    const job = createMockJob({ campaignId: "campaign-1" });

    await expect(
      processSummaryJob(job, {
        db: db as any,
        openai: openai as any,
        model: "gpt-4o-mini",
        logger: logger as any,
      }),
    ).rejects.toThrow("Empty summary from LLM");

    // Should not insert a bad summary
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("includes event data in the LLM prompt", async () => {
    const db = createMockDb({
      events: [
        {
          seq: 1,
          eventName: "player_action",
          payload: { text: "I cast fireball" },
        },
        {
          seq: 2,
          eventName: "roll_result",
          payload: { formula: "8d6", total: 28 },
        },
      ],
    });

    const job = createMockJob({ campaignId: "campaign-1" });

    await processSummaryJob(job, {
      db: db as any,
      openai: openai as any,
      model: "gpt-4o-mini",
      logger: logger as any,
    });

    const prompt =
      openai.chat.completions.create.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("fireball");
    expect(prompt).toContain("8d6");
    expect(prompt).toContain("[seq 1]");
    expect(prompt).toContain("[seq 2]");
  });

  it("reports progress through the job lifecycle", async () => {
    const db = createMockDb();
    const job = createMockJob({ campaignId: "campaign-1" });

    await processSummaryJob(job, {
      db: db as any,
      openai: openai as any,
      model: "gpt-4o-mini",
      logger: logger as any,
    });

    const progressCalls = (
      job.updateProgress as ReturnType<typeof vi.fn>
    ).mock.calls.map((c) => c[0]);
    expect(progressCalls).toContain(10);
    expect(progressCalls).toContain(30);
    expect(progressCalls).toContain(80);
    expect(progressCalls).toContain(100);
  });
});

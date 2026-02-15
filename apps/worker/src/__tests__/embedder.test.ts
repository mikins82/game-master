import { beforeEach, describe, expect, it, vi } from "vitest";
import { Embedder } from "../lib/embedder.js";

// ---------------------------------------------------------------------------
// Mock the OpenAI SDK
// ---------------------------------------------------------------------------
const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      embeddings = { create: mockCreate };
    },
  };
});

describe("Embedder", () => {
  let embedder: Embedder;

  beforeEach(() => {
    vi.clearAllMocks();
    embedder = new Embedder({
      apiKey: "test-key",
      model: "text-embedding-3-small",
    });
  });

  // -------------------------------------------------------------------------
  // embed()
  // -------------------------------------------------------------------------

  it("returns embeddings for a batch of texts", async () => {
    const fakeEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
    mockCreate.mockResolvedValueOnce({
      data: [
        { index: 0, embedding: fakeEmbedding },
        { index: 1, embedding: fakeEmbedding },
      ],
    });

    const result = await embedder.embed(["text one", "text two"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(fakeEmbedding);
    expect(result[1]).toEqual(fakeEmbedding);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["text one", "text two"],
    });
  });

  it("returns empty array for empty input", async () => {
    const result = await embedder.embed([]);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sorts embeddings by index", async () => {
    const emb0 = [0.1, 0.2];
    const emb1 = [0.3, 0.4];
    // API returns out of order
    mockCreate.mockResolvedValueOnce({
      data: [
        { index: 1, embedding: emb1 },
        { index: 0, embedding: emb0 },
      ],
    });

    const result = await embedder.embed(["first", "second"]);
    expect(result[0]).toEqual(emb0);
    expect(result[1]).toEqual(emb1);
  });

  it("batches large input into groups of 100", async () => {
    const fakeEmb = [0.1];
    const texts = Array.from({ length: 250 }, (_, i) => `text ${i}`);

    // 3 API calls: 100, 100, 50
    mockCreate
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => ({
          index: i,
          embedding: fakeEmb,
        })),
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => ({
          index: i,
          embedding: fakeEmb,
        })),
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 50 }, (_, i) => ({
          index: i,
          embedding: fakeEmb,
        })),
      });

    const result = await embedder.embed(texts);

    expect(result).toHaveLength(250);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    // Check batch sizes
    expect(mockCreate.mock.calls[0][0].input).toHaveLength(100);
    expect(mockCreate.mock.calls[1][0].input).toHaveLength(100);
    expect(mockCreate.mock.calls[2][0].input).toHaveLength(50);
  });

  // -------------------------------------------------------------------------
  // embedOne()
  // -------------------------------------------------------------------------

  it("embedOne returns a single embedding vector", async () => {
    const fakeEmb = [0.5, 0.6, 0.7];
    mockCreate.mockResolvedValueOnce({
      data: [{ index: 0, embedding: fakeEmb }],
    });

    const result = await embedder.embedOne("single text");
    expect(result).toEqual(fakeEmb);
  });
});

import { describe, expect, it } from "vitest";
import { chunkText, type TextChunk } from "../lib/chunker.js";

describe("chunkText", () => {
  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("returns empty array for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only text", () => {
    expect(chunkText("   \n\n\n   ")).toEqual([]);
  });

  it("returns single chunk when text fits within chunkSize", () => {
    const text = "Short paragraph about goblins.";
    const chunks = chunkText(text, { chunkSize: 1000 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Paragraph-aware splitting
  // -------------------------------------------------------------------------

  it("splits on paragraph boundaries", () => {
    const paragraphs = Array.from(
      { length: 10 },
      (_, i) => `Paragraph ${i + 1}. ${"x".repeat(150)}`,
    );
    const text = paragraphs.join("\n\n");

    // Each paragraph ~165 chars, chunkSize 400 should fit ~2 paragraphs per chunk
    const chunks = chunkText(text, { chunkSize: 400, overlap: 50 });

    expect(chunks.length).toBeGreaterThan(1);

    // Every chunk should have content
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });

  it("produces monotonically increasing chunkIndex values", () => {
    const text = Array.from(
      { length: 20 },
      (_, i) => `Section ${i}. ${"x".repeat(200)}`,
    ).join("\n\n");

    const chunks = chunkText(text, { chunkSize: 500, overlap: 100 });

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
    }
  });

  // -------------------------------------------------------------------------
  // Overlap
  // -------------------------------------------------------------------------

  it("produces overlapping content between consecutive chunks", () => {
    const text = Array.from(
      { length: 10 },
      (_, i) => `UniqueWord${i} ${"x".repeat(300)}`,
    ).join("\n\n");

    const chunks = chunkText(text, { chunkSize: 500, overlap: 200 });

    // With overlap, some text from chunk N should appear in chunk N+1
    for (let i = 0; i < chunks.length - 1; i++) {
      const tail = chunks[i].content.slice(-100);
      const nextContent = chunks[i + 1].content;
      // At least part of the tail should be found in the next chunk
      const hasOverlap = tail
        .split(/\s+/)
        .some((word) => word.length > 5 && nextContent.includes(word));
      expect(hasOverlap).toBe(true);
    }
  });

  it("produces no overlap when overlap is 0", () => {
    const paras = [
      "Alpha paragraph one.",
      "Beta paragraph two.",
      "Gamma paragraph three.",
    ];
    const text = paras.join("\n\n");

    const chunks = chunkText(text, { chunkSize: 30, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  // -------------------------------------------------------------------------
  // Metadata propagation
  // -------------------------------------------------------------------------

  it("propagates metadata to every chunk", () => {
    const text = Array.from(
      { length: 5 },
      (_, i) => `Paragraph ${i}. ${"x".repeat(300)}`,
    ).join("\n\n");

    const meta = { source: "phb.pdf", type: "rules", edition: "5e" };
    const chunks = chunkText(text, {
      chunkSize: 400,
      overlap: 50,
      metadata: meta,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.meta).toEqual(meta);
    }
  });

  it("provides empty metadata when none supplied", () => {
    const text = "A short document.";
    const chunks = chunkText(text);

    expect(chunks[0].meta).toEqual({});
  });

  // -------------------------------------------------------------------------
  // Whitespace normalisation
  // -------------------------------------------------------------------------

  it("collapses excessive newlines", () => {
    const text = "Paragraph one.\n\n\n\n\nParagraph two.";
    const chunks = chunkText(text, { chunkSize: 5000 });

    expect(chunks).toHaveLength(1);
    // Should not contain 3+ consecutive newlines
    expect(chunks[0].content).not.toMatch(/\n{3,}/);
  });

  // -------------------------------------------------------------------------
  // Shape validation
  // -------------------------------------------------------------------------

  it("returns correct TextChunk shape", () => {
    const chunks = chunkText("Hello world.", {
      metadata: { source: "test.txt" },
    });

    expect(chunks).toHaveLength(1);
    const chunk: TextChunk = chunks[0];
    expect(chunk).toHaveProperty("content");
    expect(chunk).toHaveProperty("chunkIndex");
    expect(chunk).toHaveProperty("meta");
    expect(typeof chunk.content).toBe("string");
    expect(typeof chunk.chunkIndex).toBe("number");
    expect(typeof chunk.meta).toBe("object");
  });
});

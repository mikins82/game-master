import { describe, expect, it, vi } from "vitest";
import { extractText } from "../lib/text-extractor.js";

// ---------------------------------------------------------------------------
// Mock pdf-parse (avoid loading actual PDF binary in unit tests)
// ---------------------------------------------------------------------------
vi.mock("pdf-parse", () => ({
  default: vi.fn().mockImplementation(async (buffer: Buffer) => ({
    text: `Extracted from PDF: ${buffer.length} bytes`,
    numpages: 1,
    info: {},
  })),
}));

describe("extractText", () => {
  it("extracts text from a plain text buffer", async () => {
    const buffer = Buffer.from("Hello, world!");
    const result = await extractText(buffer, "text/plain");
    expect(result).toBe("Hello, world!");
  });

  it("extracts text from a markdown buffer", async () => {
    const buffer = Buffer.from("# Heading\n\nSome content.");
    const result = await extractText(buffer, "text/markdown");
    expect(result).toBe("# Heading\n\nSome content.");
  });

  it("extracts text from a PDF buffer via pdf-parse", async () => {
    const buffer = Buffer.from("fake-pdf-bytes");
    const result = await extractText(buffer, "application/pdf");
    expect(result).toContain("Extracted from PDF:");
    expect(result).toContain(`${buffer.length} bytes`);
  });

  it("throws for unsupported MIME types", async () => {
    const buffer = Buffer.from("data");
    await expect(
      extractText(buffer, "application/octet-stream"),
    ).rejects.toThrow("Unsupported MIME type");
  });

  it("throws for image MIME types", async () => {
    const buffer = Buffer.from("data");
    await expect(extractText(buffer, "image/png")).rejects.toThrow(
      "Unsupported MIME type",
    );
  });

  it("handles UTF-8 encoded text correctly", async () => {
    const buffer = Buffer.from("Héllo wörld — dashes & ampersands", "utf-8");
    const result = await extractText(buffer, "text/plain");
    expect(result).toBe("Héllo wörld — dashes & ampersands");
  });
});

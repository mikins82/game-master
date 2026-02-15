import pdfParse from "pdf-parse";

// ---------------------------------------------------------------------------
// Text extraction — converts raw file buffers into plain text
// ---------------------------------------------------------------------------

/**
 * Extract plain text from a file buffer based on its MIME type.
 *
 * Supported types:
 * - `application/pdf` — uses pdf-parse
 * - `text/plain`, `text/markdown` — UTF-8 decode
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  switch (mimeType) {
    case "application/pdf":
      return extractPdf(buffer);
    case "text/plain":
    case "text/markdown":
      return buffer.toString("utf-8");
    default:
      throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`);
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}

import type { ChunkMeta } from "../queues.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Target chunk size in characters (~500 tokens). */
const DEFAULT_CHUNK_SIZE = 2000;

/** Overlap between consecutive chunks in characters (~100 tokens). */
const DEFAULT_OVERLAP = 400;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkOptions {
  /** Maximum characters per chunk (default: 2000) */
  chunkSize?: number;
  /** Overlap between consecutive chunks (default: 400) */
  overlap?: number;
  /** Base metadata applied to every chunk */
  metadata?: ChunkMeta;
}

export interface TextChunk {
  /** The chunk text content */
  content: string;
  /** 0-based index of this chunk within the document */
  chunkIndex: number;
  /** Metadata for this chunk */
  meta: ChunkMeta;
}

// ---------------------------------------------------------------------------
// Chunking logic
// ---------------------------------------------------------------------------

/**
 * Split text into overlapping chunks while respecting paragraph boundaries.
 *
 * Strategy:
 * 1. Split text into paragraphs (double newline).
 * 2. Accumulate paragraphs until the chunk reaches `chunkSize`.
 * 3. Emit the chunk and back-track by `overlap` characters for context
 *    continuity.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  const baseMeta: ChunkMeta = options.metadata ?? {};

  // Normalise whitespace — collapse 3+ newlines into 2
  const normalised = text.replace(/\n{3,}/g, "\n\n").trim();

  if (normalised.length === 0) {
    return [];
  }

  // If the entire text fits in one chunk, return it as-is
  if (normalised.length <= chunkSize) {
    return [{ content: normalised, chunkIndex: 0, meta: { ...baseMeta } }];
  }

  const paragraphs = normalised.split(/\n\n+/);
  const chunks: TextChunk[] = [];

  let buffer = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) continue;

    const candidate = buffer.length === 0 ? trimmed : `${buffer}\n\n${trimmed}`;

    if (candidate.length > chunkSize && buffer.length > 0) {
      // Emit current buffer as a chunk
      chunks.push({
        content: buffer.trim(),
        chunkIndex,
        meta: { ...baseMeta },
      });
      chunkIndex++;

      // Create overlap: take last `overlap` chars from the buffer
      const overlapText = buffer.slice(-overlap).trim();
      buffer =
        overlapText.length > 0 ? `${overlapText}\n\n${trimmed}` : trimmed;
    } else {
      buffer = candidate;
    }
  }

  // Emit remaining buffer
  if (buffer.trim().length > 0) {
    chunks.push({
      content: buffer.trim(),
      chunkIndex,
      meta: { ...baseMeta },
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// RAG retrieval — pgvector similarity search
// ---------------------------------------------------------------------------

import type pg from "pg";
import type { RagChunk } from "../prompts/context-builder.js";

/**
 * Query pgvector for the top-k most relevant RAG chunks.
 *
 * Uses cosine distance (`<=>`) on the `rag_chunk.embedding` column.
 * Optionally filters by campaign_id and/or metadata fields.
 */
export async function retrieveChunks(
  pool: pg.Pool,
  params: {
    queryEmbedding: number[];
    campaignId?: string;
    k?: number;
    filters?: Record<string, unknown>;
  },
): Promise<RagChunk[]> {
  const k = params.k ?? 6;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  // Embedding vector parameter
  const embeddingParam = `$${paramIdx++}`;
  values.push(`[${params.queryEmbedding.join(",")}]`);

  // Campaign filter: include global docs (NULL campaign_id) and campaign-specific
  if (params.campaignId) {
    conditions.push(
      `(rd.campaign_id = $${paramIdx} OR rd.campaign_id IS NULL)`,
    );
    values.push(params.campaignId);
    paramIdx++;
  }

  // Metadata filters (JSONB containment)
  if (params.filters && Object.keys(params.filters).length > 0) {
    conditions.push(`rc.meta @> $${paramIdx}::jsonb`);
    values.push(JSON.stringify(params.filters));
    paramIdx++;
  }

  // Limit
  values.push(k);
  const limitParam = `$${paramIdx}`;

  const whereClause =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const query = `
    SELECT
      rc.content,
      rc.meta,
      1 - (rc.embedding <=> ${embeddingParam}::vector) AS score
    FROM rag_chunk rc
    JOIN rag_document rd ON rd.id = rc.document_id
    ${whereClause}
    ORDER BY rc.embedding <=> ${embeddingParam}::vector ASC
    LIMIT ${limitParam}
  `;

  const result = await pool.query(query, values);

  return result.rows.map((row) => ({
    content: row.content as string,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    score: parseFloat(row.score as string),
  }));
}

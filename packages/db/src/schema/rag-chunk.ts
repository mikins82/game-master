import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { ragDocument } from "./rag-document.js";

// ---------------------------------------------------------------------------
// pgvector custom column type
// ---------------------------------------------------------------------------
const vector = customType<{
  data: number[];
  driverParam: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    return String(value)
      .replace(/[\[\]]/g, "")
      .split(",")
      .map(Number);
  },
});

// ---------------------------------------------------------------------------
// rag_chunk table
// ---------------------------------------------------------------------------
export const ragChunk = pgTable(
  "rag_chunk",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => ragDocument.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    meta: jsonb("meta").default({}),
    chunkIndex: integer("chunk_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Document traversal index
    index("rag_chunk_document_id_idx").on(t.documentId),
    // GIN index for filtered metadata retrieval
    index("rag_chunk_meta_gin_idx").using("gin", t.meta),
    // HNSW vector index for nearest-neighbor search
    index("rag_chunk_embedding_hnsw_idx").using(
      "hnsw",
      sql`${t.embedding} vector_cosine_ops`,
    ),
  ],
);

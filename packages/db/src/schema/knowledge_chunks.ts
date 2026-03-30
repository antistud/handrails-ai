import { pgTable, uuid, text, integer, timestamp, index, customType } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { knowledgeDocuments } from "./knowledge_documents.js";

/**
 * Custom pgvector type for Drizzle ORM.
 * Stores embeddings as vector(1536) — compatible with OpenAI text-embedding-3-small.
 * The dimension is configurable at the application level; the column stores any dimension.
 */
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    // Postgres returns vectors as '[1,2,3]'
    const str = String(value);
    return str
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    chunkIndex: integer("chunk_index").notNull().default(0),
    tokenCount: integer("token_count"),
    metadata: text("metadata"), // JSON — section headers, page numbers, etc.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentIdx: index("knowledge_chunks_document_idx").on(table.documentId),
    companyIdx: index("knowledge_chunks_company_idx").on(table.companyId),
  }),
);

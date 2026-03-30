import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    title: text("title"),
    sourceType: text("source_type").notNull().default("repo"), // 'repo' | 'upload' | 'url' | 'manual'
    sourcePath: text("source_path"), // relative path in business repo
    sourceUrl: text("source_url"),
    contentHash: text("content_hash"), // change detection for re-indexing
    metadata: text("metadata"), // JSON metadata
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("knowledge_documents_company_idx").on(table.companyId),
    companySourcePathIdx: index("knowledge_documents_company_source_path_idx").on(
      table.companyId,
      table.sourcePath,
    ),
    contentHashIdx: index("knowledge_documents_content_hash_idx").on(table.companyId, table.contentHash),
  }),
);

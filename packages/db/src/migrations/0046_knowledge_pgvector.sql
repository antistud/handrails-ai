-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge documents: source of truth for company knowledge base
CREATE TABLE IF NOT EXISTS "knowledge_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "title" text,
  "source_type" text DEFAULT 'repo' NOT NULL,
  "source_path" text,
  "source_url" text,
  "content_hash" text,
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_company_idx" ON "knowledge_documents" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_company_source_path_idx" ON "knowledge_documents" USING btree ("company_id", "source_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_content_hash_idx" ON "knowledge_documents" USING btree ("company_id", "content_hash");

--> statement-breakpoint

-- Knowledge chunks: embedded text segments for vector search
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "knowledge_documents"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "content" text NOT NULL,
  "embedding" vector(1536),
  "chunk_index" integer DEFAULT 0 NOT NULL,
  "token_count" integer,
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_document_idx" ON "knowledge_chunks" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_company_idx" ON "knowledge_chunks" USING btree ("company_id");
--> statement-breakpoint
-- IVFFlat index for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
--> statement-breakpoint
-- Full-text search index on content
ALTER TABLE "knowledge_chunks" ADD COLUMN IF NOT EXISTS "ts_vector" tsvector GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_ts_vector_idx" ON "knowledge_chunks" USING GIN ("ts_vector");

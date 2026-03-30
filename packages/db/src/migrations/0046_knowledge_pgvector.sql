-- Enable pgvector extension for semantic search (if available)
-- This is a no-op if pgvector is not installed; embedding column will use bytea fallback
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available — vector indexes will be skipped. Install pgvector for full semantic search.';
END $$;

--> statement-breakpoint

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
-- Uses vector(1536) if pgvector is available, otherwise stores embeddings as JSON text
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "knowledge_documents"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "content" text NOT NULL,
  "embedding" text,
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

-- Upgrade embedding column to vector type if pgvector is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE "knowledge_chunks" ALTER COLUMN "embedding" TYPE vector(1536) USING "embedding"::vector(1536);
    CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
  END IF;
END $$;

--> statement-breakpoint

-- Full-text search (works without pgvector)
ALTER TABLE "knowledge_chunks" ADD COLUMN IF NOT EXISTS "ts_vector" tsvector GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_ts_vector_idx" ON "knowledge_chunks" USING GIN ("ts_vector");

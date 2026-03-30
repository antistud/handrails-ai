/**
 * Knowledge service — the core of the Handrails knowledge layer.
 *
 * Responsibilities:
 * - Ingest documents (from business repo, upload, or URL)
 * - Chunk and embed documents into pgvector
 * - Hybrid retrieval: vector similarity + keyword (tsvector) + RRF fusion
 * - Company-scoped isolation
 */

import { and, eq, sql, inArray, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Logger } from "pino";
import { knowledgeDocuments, knowledgeChunks } from "@handrailsai/db";
import {
  type EmbeddingProvider,
  createOpenAIEmbeddingProvider,
  computeContentHash,
} from "./knowledge-embeddings.js";
import { chunkText, type ChunkingConfig } from "./knowledge-chunking.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KnowledgeConfig {
  embeddingProvider: string; // "openai" | "voyage"
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  chunkStrategy: "fixed" | "markdown";
}

export interface IngestDocumentInput {
  companyId: string;
  title: string;
  content: string;
  sourceType: "repo" | "upload" | "url" | "manual";
  sourcePath?: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  companyId: string;
  query: string;
  limit?: number;
  scopes?: string[]; // filter by source_path prefix (e.g., "sops/", "docs/")
  hybridWeight?: number; // 0 = pure keyword, 1 = pure vector. Default: 0.6
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string | null;
  sourcePath: string | null;
  content: string;
  score: number;
  matchType: "vector" | "keyword" | "hybrid";
}

// ─── Service ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: KnowledgeConfig = {
  embeddingProvider: "openai",
  embeddingModel: "text-embedding-3-small",
  chunkSize: 512,
  chunkOverlap: 50,
  chunkStrategy: "fixed",
};

export function createKnowledgeService(deps: {
  db: PostgresJsDatabase<Record<string, unknown>>;
  logger: Logger;
  config?: Partial<KnowledgeConfig>;
}) {
  const { db, logger } = deps;
  const config = { ...DEFAULT_CONFIG, ...deps.config };

  let embeddingProvider: EmbeddingProvider | null = null;

  function getEmbeddingProvider(): EmbeddingProvider {
    if (!embeddingProvider) {
      embeddingProvider = createOpenAIEmbeddingProvider({
        model: config.embeddingModel,
      });
    }
    return embeddingProvider;
  }

  const chunkingConfig: Partial<ChunkingConfig> = {
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    strategy: config.chunkStrategy,
  };

  // ─── Ingest ──────────────────────────────────────────────────────────────

  /**
   * Ingest a document: chunk it, embed it, store in pgvector.
   * Skips if content_hash matches (idempotent).
   */
  async function ingestDocument(input: IngestDocumentInput): Promise<{
    documentId: string;
    chunksCreated: number;
    skipped: boolean;
  }> {
    const contentHash = computeContentHash(input.content);

    // Check for existing document with same source path and hash
    if (input.sourcePath) {
      const existing = await db
        .select({ id: knowledgeDocuments.id, contentHash: knowledgeDocuments.contentHash })
        .from(knowledgeDocuments)
        .where(
          and(
            eq(knowledgeDocuments.companyId, input.companyId),
            eq(knowledgeDocuments.sourcePath, input.sourcePath),
          ),
        )
        .then((rows) => rows[0]);

      if (existing && existing.contentHash === contentHash) {
        return { documentId: existing.id, chunksCreated: 0, skipped: true };
      }

      // If exists but hash changed, delete old chunks and update
      if (existing) {
        await db
          .delete(knowledgeChunks)
          .where(eq(knowledgeChunks.documentId, existing.id));
        await db
          .update(knowledgeDocuments)
          .set({
            title: input.title,
            contentHash,
            metadata: input.metadata ? JSON.stringify(input.metadata) : null,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeDocuments.id, existing.id));

        const chunks = chunkText(input.content, chunkingConfig);
        const embeddings = await getEmbeddingProvider().embed(
          chunks.map((c) => c.content),
        );

        await insertChunks(existing.id, input.companyId, chunks, embeddings);

        logger.info(
          { documentId: existing.id, chunks: chunks.length },
          "Re-indexed knowledge document",
        );
        return { documentId: existing.id, chunksCreated: chunks.length, skipped: false };
      }
    }

    // New document
    const [doc] = await db
      .insert(knowledgeDocuments)
      .values({
        companyId: input.companyId,
        title: input.title,
        sourceType: input.sourceType,
        sourcePath: input.sourcePath ?? null,
        sourceUrl: input.sourceUrl ?? null,
        contentHash,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      })
      .returning({ id: knowledgeDocuments.id });

    const documentId = doc!.id;
    const chunks = chunkText(input.content, chunkingConfig);
    const embeddings = await getEmbeddingProvider().embed(
      chunks.map((c) => c.content),
    );

    await insertChunks(documentId, input.companyId, chunks, embeddings);

    logger.info(
      { documentId, chunks: chunks.length, sourcePath: input.sourcePath },
      "Ingested knowledge document",
    );
    return { documentId, chunksCreated: chunks.length, skipped: false };
  }

  async function insertChunks(
    documentId: string,
    companyId: string,
    chunks: Array<{ content: string; chunkIndex: number; tokenCount: number; metadata?: Record<string, unknown> }>,
    embeddings: number[][],
  ): Promise<void> {
    if (chunks.length === 0) return;

    // Insert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchEmbeddings = embeddings.slice(i, i + batchSize);

      await db.insert(knowledgeChunks).values(
        batch.map((chunk, idx) => ({
          documentId,
          companyId,
          content: chunk.content,
          embedding: batchEmbeddings[idx]!,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          metadata: chunk.metadata ? JSON.stringify(chunk.metadata) : null,
        })),
      );
    }
  }

  // ─── Retrieval ───────────────────────────────────────────────────────────

  /**
   * Hybrid search: vector similarity + keyword ranking, fused with RRF.
   */
  async function search(opts: SearchOptions): Promise<SearchResult[]> {
    const limit = opts.limit ?? 10;
    const hybridWeight = opts.hybridWeight ?? 0.6;

    // Build scope filter
    const scopeConditions: SQL[] = [eq(knowledgeChunks.companyId, opts.companyId)];
    if (opts.scopes && opts.scopes.length > 0) {
      const scopeOr = opts.scopes.map((scope) =>
        sql`${knowledgeDocuments.sourcePath} LIKE ${scope + "%"}`,
      );
      scopeConditions.push(sql`(${sql.join(scopeOr, sql` OR `)})`);
    }
    const scopeFilter = and(...scopeConditions)!;

    // Run vector and keyword searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      searchVector(opts.query, scopeFilter, limit * 2),
      searchKeyword(opts.query, scopeFilter, limit * 2),
    ]);

    // Reciprocal Rank Fusion (RRF)
    const k = 60; // RRF constant
    const scores = new Map<string, { score: number; result: SearchResult }>();

    for (let i = 0; i < vectorResults.length; i++) {
      const r = vectorResults[i]!;
      const rrfScore = hybridWeight / (k + i + 1);
      scores.set(r.chunkId, {
        score: rrfScore,
        result: { ...r, score: rrfScore, matchType: "vector" },
      });
    }

    for (let i = 0; i < keywordResults.length; i++) {
      const r = keywordResults[i]!;
      const rrfScore = (1 - hybridWeight) / (k + i + 1);
      const existing = scores.get(r.chunkId);
      if (existing) {
        existing.score += rrfScore;
        existing.result.score = existing.score;
        existing.result.matchType = "hybrid";
      } else {
        scores.set(r.chunkId, {
          score: rrfScore,
          result: { ...r, score: rrfScore, matchType: "keyword" },
        });
      }
    }

    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.result);
  }

  /**
   * Vector similarity search using pgvector cosine distance.
   */
  async function searchVector(
    query: string,
    scopeFilter: SQL,
    limit: number,
  ): Promise<SearchResult[]> {
    const provider = getEmbeddingProvider();
    const [queryEmbedding] = await provider.embed([query]);
    if (!queryEmbedding) return [];

    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const results = await db
      .select({
        chunkId: knowledgeChunks.id,
        documentId: knowledgeChunks.documentId,
        documentTitle: knowledgeDocuments.title,
        sourcePath: knowledgeDocuments.sourcePath,
        content: knowledgeChunks.content,
        distance: sql<number>`${knowledgeChunks.embedding} <=> ${embeddingStr}::vector`,
      })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeDocuments,
        eq(knowledgeChunks.documentId, knowledgeDocuments.id),
      )
      .where(and(scopeFilter, sql`${knowledgeChunks.embedding} IS NOT NULL`))
      .orderBy(sql`${knowledgeChunks.embedding} <=> ${embeddingStr}::vector`)
      .limit(limit);

    return results.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      sourcePath: r.sourcePath,
      content: r.content,
      score: 1 - r.distance, // Convert distance to similarity
      matchType: "vector" as const,
    }));
  }

  /**
   * Full-text keyword search using PostgreSQL tsvector.
   */
  async function searchKeyword(
    query: string,
    scopeFilter: SQL,
    limit: number,
  ): Promise<SearchResult[]> {
    const tsQuery = query
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter((w) => w.length > 0)
      .join(" & ");

    if (!tsQuery) return [];

    const results = await db
      .select({
        chunkId: knowledgeChunks.id,
        documentId: knowledgeChunks.documentId,
        documentTitle: knowledgeDocuments.title,
        sourcePath: knowledgeDocuments.sourcePath,
        content: knowledgeChunks.content,
        rank: sql<number>`ts_rank(${knowledgeChunks}.ts_vector, to_tsquery('english', ${tsQuery}))`,
      })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeDocuments,
        eq(knowledgeChunks.documentId, knowledgeDocuments.id),
      )
      .where(
        and(
          scopeFilter,
          sql`${knowledgeChunks}.ts_vector @@ to_tsquery('english', ${tsQuery})`,
        ),
      )
      .orderBy(sql`ts_rank(${knowledgeChunks}.ts_vector, to_tsquery('english', ${tsQuery})) DESC`)
      .limit(limit);

    return results.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      sourcePath: r.sourcePath,
      content: r.content,
      score: r.rank,
      matchType: "keyword" as const,
    }));
  }

  // ─── Management ──────────────────────────────────────────────────────────

  /**
   * Delete a knowledge document and its chunks.
   */
  async function deleteDocument(companyId: string, documentId: string): Promise<boolean> {
    const result = await db
      .delete(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.id, documentId),
          eq(knowledgeDocuments.companyId, companyId),
        ),
      )
      .returning({ id: knowledgeDocuments.id });
    return result.length > 0;
  }

  /**
   * List all knowledge documents for a company.
   */
  async function listDocuments(companyId: string): Promise<
    Array<{
      id: string;
      title: string | null;
      sourceType: string;
      sourcePath: string | null;
      contentHash: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    return db
      .select({
        id: knowledgeDocuments.id,
        title: knowledgeDocuments.title,
        sourceType: knowledgeDocuments.sourceType,
        sourcePath: knowledgeDocuments.sourcePath,
        contentHash: knowledgeDocuments.contentHash,
        createdAt: knowledgeDocuments.createdAt,
        updatedAt: knowledgeDocuments.updatedAt,
      })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.companyId, companyId))
      .orderBy(knowledgeDocuments.updatedAt);
  }

  /**
   * Bulk ingest from a business repo's knowledge directory.
   * Reads all files, compares hashes, and only re-embeds changed documents.
   */
  async function syncFromRepo(
    companyId: string,
    files: Array<{ path: string; title: string; content: string }>,
  ): Promise<{ ingested: number; skipped: number; deleted: number }> {
    const currentPaths = new Set(files.map((f) => f.path));

    // Find existing repo documents
    const existing = await db
      .select({
        id: knowledgeDocuments.id,
        sourcePath: knowledgeDocuments.sourcePath,
      })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.companyId, companyId),
          eq(knowledgeDocuments.sourceType, "repo"),
        ),
      );

    // Delete documents whose source files no longer exist
    const toDelete = existing.filter((e) => e.sourcePath && !currentPaths.has(e.sourcePath));
    let deleted = 0;
    if (toDelete.length > 0) {
      await db
        .delete(knowledgeDocuments)
        .where(
          inArray(
            knowledgeDocuments.id,
            toDelete.map((d) => d.id),
          ),
        );
      deleted = toDelete.length;
    }

    // Ingest new or changed files
    let ingested = 0;
    let skipped = 0;
    for (const file of files) {
      const result = await ingestDocument({
        companyId,
        title: file.title,
        content: file.content,
        sourceType: "repo",
        sourcePath: file.path,
      });
      if (result.skipped) {
        skipped++;
      } else {
        ingested++;
      }
    }

    logger.info(
      { companyId, ingested, skipped, deleted },
      "Knowledge repo sync complete",
    );
    return { ingested, skipped, deleted };
  }

  /**
   * Get knowledge context for a task dispatch.
   * Called during heartbeat to inject relevant knowledge into agent context.
   */
  async function getContextForTask(
    companyId: string,
    taskTitle: string,
    taskDescription: string,
    scopes?: string[],
  ): Promise<string> {
    const query = [taskTitle, taskDescription].filter(Boolean).join(" ");
    if (!query) return "";

    try {
      const results = await search({
        companyId,
        query,
        limit: 5,
        scopes,
      });

      if (results.length === 0) return "";

      const sections = results.map((r) => {
        const source = r.sourcePath ? `[${r.sourcePath}]` : "";
        const title = r.documentTitle ? `## ${r.documentTitle} ${source}` : `## ${source}`;
        return `${title}\n${r.content}`;
      });

      return `\n---\n## Relevant Knowledge\n\n${sections.join("\n\n---\n\n")}\n---\n`;
    } catch (err) {
      logger.warn({ err, companyId }, "Knowledge retrieval failed, continuing without context");
      return "";
    }
  }

  return {
    ingestDocument,
    search,
    deleteDocument,
    listDocuments,
    syncFromRepo,
    getContextForTask,
  };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;

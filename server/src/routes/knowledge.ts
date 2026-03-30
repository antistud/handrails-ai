/**
 * Knowledge API routes.
 * Company-scoped endpoints for managing and searching the knowledge base.
 */

import { Router } from "express";
import type { Db } from "@handrailsai/db";
import type { KnowledgeService } from "../services/knowledge.js";

export function knowledgeRoutes(db: Db, knowledgeService: KnowledgeService) {
  const router = Router();

  // Search knowledge base
  router.post("/companies/:companyId/knowledge/search", async (req, res) => {
    const { companyId } = req.params;
    const { query, limit, scopes, hybridWeight } = req.body as {
      query: string;
      limit?: number;
      scopes?: string[];
      hybridWeight?: number;
    };

    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "query is required" });
      return;
    }

    const results = await knowledgeService.search({
      companyId: companyId!,
      query,
      limit,
      scopes,
      hybridWeight,
    });

    res.json({ results });
  });

  // List knowledge documents
  router.get("/companies/:companyId/knowledge/documents", async (req, res) => {
    const { companyId } = req.params;
    const documents = await knowledgeService.listDocuments(companyId!);
    res.json({ documents });
  });

  // Ingest a knowledge document
  router.post("/companies/:companyId/knowledge/documents", async (req, res) => {
    const { companyId } = req.params;
    const { title, content, sourceType, sourcePath, sourceUrl, metadata } = req.body as {
      title: string;
      content: string;
      sourceType?: "repo" | "upload" | "url" | "manual";
      sourcePath?: string;
      sourceUrl?: string;
      metadata?: Record<string, unknown>;
    };

    if (!title || !content) {
      res.status(400).json({ error: "title and content are required" });
      return;
    }

    const result = await knowledgeService.ingestDocument({
      companyId: companyId!,
      title,
      content,
      sourceType: sourceType ?? "manual",
      sourcePath,
      sourceUrl,
      metadata,
    });

    res.status(result.skipped ? 200 : 201).json(result);
  });

  // Delete a knowledge document
  router.delete(
    "/companies/:companyId/knowledge/documents/:documentId",
    async (req, res) => {
      const { companyId, documentId } = req.params;
      const deleted = await knowledgeService.deleteDocument(companyId!, documentId!);
      if (!deleted) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      res.json({ deleted: true });
    },
  );

  // Sync knowledge from business repo
  router.post("/companies/:companyId/knowledge/sync", async (req, res) => {
    const { companyId } = req.params;
    const { files } = req.body as {
      files: Array<{ path: string; title: string; content: string }>;
    };

    if (!Array.isArray(files)) {
      res.status(400).json({ error: "files array is required" });
      return;
    }

    const result = await knowledgeService.syncFromRepo(companyId!, files);
    res.json(result);
  });

  return router;
}

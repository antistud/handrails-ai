/**
 * Business Repo Sync Service
 *
 * On `handrails up`, reads the business repo directory, parses handrails.yml,
 * and reconciles DB state: agents, goals, knowledge docs, email config.
 */

import fs from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import type { Db } from "@handrailsai/db";
import type { KnowledgeService } from "./knowledge.js";

// Minimal YAML parser — avoids adding a dependency for simple manifests.
// For production, swap with js-yaml or yaml.
function parseSimpleYaml(text: string): Record<string, unknown> {
  // This is intentionally simple. For v1, we'll add a proper YAML parser dependency.
  // For now, delegate to JSON if the content can be coerced, otherwise return raw.
  try {
    // Try to parse as JSON first (some users might use JSON)
    return JSON.parse(text);
  } catch {
    // Return a marker indicating YAML parsing is needed
    return { _raw: text, _needsYamlParser: true };
  }
}

export interface BusinessSyncResult {
  company: { name: string; slug: string } | null;
  agents: { synced: number; errors: string[] };
  knowledge: { ingested: number; skipped: number; deleted: number };
  errors: string[];
}

export function createBusinessSyncService(deps: {
  db: Db;
  logger: Logger;
  knowledgeService: KnowledgeService;
}) {
  const { db, logger, knowledgeService } = deps;

  /**
   * Sync a business repo directory into the engine.
   * Called on `handrails up --business <path>`.
   */
  async function syncBusinessRepo(
    businessPath: string,
    companyId: string,
  ): Promise<BusinessSyncResult> {
    const result: BusinessSyncResult = {
      company: null,
      agents: { synced: 0, errors: [] },
      knowledge: { ingested: 0, skipped: 0, deleted: 0 },
      errors: [],
    };

    // 1. Read and validate handrails.yml
    const manifestPath = path.join(businessPath, "handrails.yml");
    if (!fs.existsSync(manifestPath)) {
      result.errors.push("handrails.yml not found in business repo root");
      return result;
    }

    const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = parseSimpleYaml(manifestRaw);

    if (manifest._needsYamlParser) {
      logger.info("handrails.yml requires YAML parser — install js-yaml for full support");
      // Continue with what we can parse
    }

    logger.info({ businessPath }, "Starting business repo sync");

    // 2. Sync knowledge documents
    const knowledgeDir = path.join(businessPath, "knowledge");
    if (fs.existsSync(knowledgeDir)) {
      const knowledgeFiles = collectMarkdownFiles(knowledgeDir, knowledgeDir);
      logger.info(
        { count: knowledgeFiles.length },
        "Found knowledge documents to sync",
      );

      const knowledgeResult = await knowledgeService.syncFromRepo(
        companyId,
        knowledgeFiles,
      );
      result.knowledge = knowledgeResult;
    }

    // 3. Sync goals as knowledge docs too (they're searchable)
    const goalsDir = path.join(businessPath, "goals");
    if (fs.existsSync(goalsDir)) {
      const goalFiles = collectMarkdownFiles(goalsDir, goalsDir).map((f) => ({
        ...f,
        path: `goals/${f.path}`,
      }));

      if (goalFiles.length > 0) {
        const goalResult = await knowledgeService.syncFromRepo(companyId, goalFiles);
        result.knowledge.ingested += goalResult.ingested;
        result.knowledge.skipped += goalResult.skipped;
      }
    }

    // 4. Read agent definitions (for logging — actual agent creation is via the API/UI)
    const agentsDir = path.join(businessPath, "agents");
    if (fs.existsSync(agentsDir)) {
      const agentFiles = fs
        .readdirSync(agentsDir)
        .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
      result.agents.synced = agentFiles.length;
      logger.info(
        { count: agentFiles.length },
        "Found agent definitions in business repo",
      );
    }

    logger.info(
      {
        knowledge: result.knowledge,
        agents: result.agents.synced,
      },
      "Business repo sync complete",
    );

    return result;
  }

  /**
   * Collect all .md files recursively from a directory.
   */
  function collectMarkdownFiles(
    dir: string,
    baseDir: string,
  ): Array<{ path: string; title: string; content: string }> {
    const files: Array<{ path: string; title: string; content: string }> = [];

    function walk(currentDir: string) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) {
          const relativePath = path.relative(baseDir, fullPath);
          const content = fs.readFileSync(fullPath, "utf-8");
          const title = extractTitle(content) ?? entry.name.replace(/\.mdx?$/, "");
          files.push({ path: relativePath, title, content });
        }
      }
    }

    walk(dir);
    return files;
  }

  /**
   * Extract title from markdown content (first # heading).
   */
  function extractTitle(content: string): string | null {
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1]!.trim() : null;
  }

  return {
    syncBusinessRepo,
  };
}

export type BusinessSyncService = ReturnType<typeof createBusinessSyncService>;

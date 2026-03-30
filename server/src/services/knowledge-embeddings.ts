/**
 * Embedding provider for the knowledge layer.
 * Supports OpenAI text-embedding-3-small (default) and extensible to Voyage AI.
 */

import { createHash } from "node:crypto";

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly model: string;
  readonly dimensions: number;
}

/**
 * OpenAI embedding provider using the REST API directly.
 * No SDK dependency — just fetch.
 */
export function createOpenAIEmbeddingProvider(opts?: {
  apiKey?: string;
  model?: string;
  dimensions?: number;
}): EmbeddingProvider {
  const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
  const model = opts?.model ?? "text-embedding-3-small";
  const dimensions = opts?.dimensions ?? 1536;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for embeddings. Set it in your .env file.",
    );
  }

  return {
    model,
    dimensions,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      // OpenAI batch limit is 2048 inputs, chunk if needed
      const batchSize = 512;
      const allEmbeddings: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const response = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: batch,
            model,
            dimensions,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `OpenAI embeddings API error ${response.status}: ${errorBody}`,
          );
        }

        const result = (await response.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
        };

        // Sort by index to maintain order
        const sorted = result.data.sort((a, b) => a.index - b.index);
        allEmbeddings.push(...sorted.map((d) => d.embedding));
      }

      return allEmbeddings;
    },
  };
}

/**
 * Compute a content hash for change detection.
 */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Simple token count approximation (4 chars ≈ 1 token for English).
 * Good enough for chunking decisions.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

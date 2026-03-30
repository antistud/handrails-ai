/**
 * Text chunking strategies for the knowledge layer.
 * Default: fixed-size chunking with overlap.
 * Optional: markdown-aware splitting.
 */

import { estimateTokenCount } from "./knowledge-embeddings.js";

export interface ChunkingConfig {
  chunkSize: number; // target tokens per chunk
  chunkOverlap: number; // overlap tokens between chunks
  strategy: "fixed" | "markdown"; // chunking strategy
}

export interface Chunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_CONFIG: ChunkingConfig = {
  chunkSize: 512,
  chunkOverlap: 50,
  strategy: "fixed",
};

/**
 * Split text into chunks using the configured strategy.
 */
export function chunkText(
  text: string,
  config: Partial<ChunkingConfig> = {},
): Chunk[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (cfg.strategy === "markdown") {
    return chunkMarkdown(text, cfg);
  }
  return chunkFixed(text, cfg);
}

/**
 * Fixed-size chunking with overlap.
 * Splits on sentence boundaries when possible.
 */
function chunkFixed(text: string, config: ChunkingConfig): Chunk[] {
  const chunks: Chunk[] = [];
  const sentences = splitSentences(text);

  let current: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokenCount(sentence);

    // If a single sentence exceeds chunk size, force-split it
    if (sentenceTokens > config.chunkSize) {
      // Flush current buffer
      if (current.length > 0) {
        chunks.push({
          content: current.join(" ").trim(),
          chunkIndex: chunkIndex++,
          tokenCount: currentTokens,
        });
        current = [];
        currentTokens = 0;
      }
      // Split long sentence by character count
      const charLimit = config.chunkSize * 4;
      for (let i = 0; i < sentence.length; i += charLimit) {
        const slice = sentence.slice(i, i + charLimit);
        chunks.push({
          content: slice.trim(),
          chunkIndex: chunkIndex++,
          tokenCount: estimateTokenCount(slice),
        });
      }
      continue;
    }

    if (currentTokens + sentenceTokens > config.chunkSize && current.length > 0) {
      // Emit chunk
      const chunkContent = current.join(" ").trim();
      chunks.push({
        content: chunkContent,
        chunkIndex: chunkIndex++,
        tokenCount: currentTokens,
      });

      // Compute overlap: keep last N tokens worth of sentences
      const overlap: string[] = [];
      let overlapTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const t = estimateTokenCount(current[i]!);
        if (overlapTokens + t > config.chunkOverlap) break;
        overlap.unshift(current[i]!);
        overlapTokens += t;
      }
      current = overlap;
      currentTokens = overlapTokens;
    }

    current.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Flush remainder
  if (current.length > 0) {
    chunks.push({
      content: current.join(" ").trim(),
      chunkIndex: chunkIndex++,
      tokenCount: currentTokens,
    });
  }

  return chunks.filter((c) => c.content.length > 0);
}

/**
 * Markdown-aware chunking.
 * Splits on headings first, then applies fixed chunking within sections.
 */
function chunkMarkdown(text: string, config: ChunkingConfig): Chunk[] {
  const sections = splitMarkdownSections(text);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionTokens = estimateTokenCount(section.content);

    if (sectionTokens <= config.chunkSize) {
      chunks.push({
        content: section.content.trim(),
        chunkIndex: chunkIndex++,
        tokenCount: sectionTokens,
        metadata: section.heading ? { heading: section.heading } : undefined,
      });
    } else {
      // Sub-chunk large sections
      const subChunks = chunkFixed(section.content, config);
      for (const sub of subChunks) {
        chunks.push({
          ...sub,
          chunkIndex: chunkIndex++,
          metadata: section.heading
            ? { ...sub.metadata, heading: section.heading }
            : sub.metadata,
        });
      }
    }
  }

  return chunks.filter((c) => c.content.length > 0);
}

/**
 * Split text into sentences (approximate).
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface MarkdownSection {
  heading: string | null;
  content: string;
}

/**
 * Split markdown into sections by headings.
 */
function splitMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split("\n");
  const sections: MarkdownSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)/);
    if (headingMatch) {
      // Flush previous section
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join("\n"),
        });
      }
      currentHeading = headingMatch[1]!.trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // Flush last section
  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join("\n"),
    });
  }

  return sections;
}

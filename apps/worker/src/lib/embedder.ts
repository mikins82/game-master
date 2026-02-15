import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Embedding client — wraps OpenAI's embeddings API with batching
// ---------------------------------------------------------------------------

/** Maximum texts per single embeddings API call. */
const MAX_BATCH_SIZE = 100;

export interface EmbedderOptions {
  apiKey: string;
  model?: string;
}

export class Embedder {
  private client: OpenAI;
  private model: string;

  constructor(options: EmbedderOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "text-embedding-3-small";
  }

  /**
   * Generate embeddings for a list of texts.
   * Automatically batches into groups of {@link MAX_BATCH_SIZE}.
   *
   * @returns Array of 1536-dimension vectors in the same order as the input.
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
      });

      // API returns embeddings sorted by index — push in order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        results.push(item.embedding);
      }
    }

    return results;
  }

  /**
   * Generate a single embedding for one text.
   */
  async embedOne(text: string): Promise<number[]> {
    const [embedding] = await this.embed([text]);
    return embedding;
  }
}

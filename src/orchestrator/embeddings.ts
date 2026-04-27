// Embedding client for concept dedup.
// Live path: Fireworks (default) or OpenAI-compatible fallback.
// Offline stand-in: deterministic hash-bucketed vector so dedup tests are stable.

import { FireworksClient, getFireworksClient } from "../llm/fireworks-client";

export type EmbeddingClient = {
  readonly live: boolean;
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
};

export type EmbeddingConfig = {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  dimension?: number;
};

/**
 * Deterministic stub embedding. 384-dim unit vector derived from a stable
 * FNV-1a hash of the text. Gives every distinct text a consistent direction;
 * texts sharing words land in similar directions.
 */
export class StubEmbeddingClient implements EmbeddingClient {
  readonly live = false;
  readonly dimension: number;

  constructor(dimension = 384) {
    this.dimension = dimension;
  }

  async embed(text: string): Promise<number[]> {
    return this.compute(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.compute(t));
  }

  private compute(text: string): number[] {
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    const vec = new Array<number>(this.dimension).fill(0);
    for (const token of tokens) {
      let hash = 0x811c9dc5;
      for (let i = 0; i < token.length; i++) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      const bucket = hash % this.dimension;
      vec[bucket] = (vec[bucket] ?? 0) + 1;
      const bucket2 = (hash >>> 9) % this.dimension;
      vec[bucket2] = (vec[bucket2] ?? 0) + 0.5;
    }
    const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

/**
 * OpenAI-compatible embeddings client. Works with OpenAI itself and Anthropic
 * Batch API or any gateway exposing /v1/embeddings.
 */
export class OpenAIEmbeddingClient implements EmbeddingClient {
  readonly live = true;
  readonly dimension: number;
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model: string;

  constructor(config: EmbeddingConfig) {
    if (!config.apiKey) throw new Error("OpenAIEmbeddingClient requires apiKey");
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl ?? "https://api.openai.com/v1/embeddings";
    this.model = config.model ?? "text-embedding-3-small";
    this.dimension = config.dimension ?? 1536;
  }

  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedBatch([text]);
    return v!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`embed call failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }
}

/**
 * Fireworks embeddings — uses the same /v1/embeddings OpenAI-compatible
 * endpoint but defaults to Fireworks's qwen3-embedding-8b model.
 */
export class FireworksEmbeddingClient implements EmbeddingClient {
  readonly live = true;
  readonly dimension: number;
  private readonly client: FireworksClient;
  private readonly model: string;

  constructor(config: EmbeddingConfig & { sharedClient?: FireworksClient } = {}) {
    const client = config.sharedClient ?? new FireworksClient({ apiKey: config.apiKey });
    this.client = client;
    this.model = config.model ?? client.defaultEmbeddingModel;
    this.dimension = config.dimension ?? client.defaultEmbeddingDimensions;
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.client.embed({
      model: this.model,
      input: text,
      dimensions: this.dimension,
    });
    return vec!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.client.embed({
      model: this.model,
      input: texts,
      dimensions: this.dimension,
    });
  }
}

export function createEmbeddingClient(config: EmbeddingConfig = {}): EmbeddingClient {
  // Prefer Fireworks.
  const fireworks = getFireworksClient({ apiKey: config.apiKey });
  if (fireworks) {
    return new FireworksEmbeddingClient({ ...config, sharedClient: fireworks });
  }
  // OpenAI fallback.
  const openaiKey = config.apiKey ?? process.env?.OPENAI_API_KEY ?? process.env?.EMBEDDINGS_API_KEY;
  if (openaiKey) {
    try {
      return new OpenAIEmbeddingClient({ ...config, apiKey: openaiKey });
    } catch {
      return new StubEmbeddingClient(config.dimension ?? 384);
    }
  }
  return new StubEmbeddingClient(config.dimension ?? 384);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

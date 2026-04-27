// Fireworks.ai client. OpenAI-compatible endpoints at api.fireworks.ai —
// used for both chat completions (proposer, T3) and embeddings.
//
// Model IDs are slash-prefixed ("accounts/fireworks/models/..." for most;
// "fireworks/qwen3-embedding-8b" for embeddings). We keep the defaults current
// but let callers override via config or env.

export type FireworksMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type FireworksChatParams = {
  model?: string;
  messages: FireworksMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" };
  stop?: string[];
};

export type FireworksChatResponse = {
  text: string;
  finishReason: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  rawChoice: unknown;
};

export type FireworksEmbedParams = {
  model?: string;
  input: string | string[];
  dimensions?: number;
};

export type FireworksConfig = {
  apiKey?: string;
  baseUrl?: string;
  defaultChatModel?: string;
  defaultEmbeddingModel?: string;
  defaultEmbeddingDimensions?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = "https://api.fireworks.ai/inference/v1";
// Chat: routed Kimi endpoint — faster than the direct model.
const DEFAULT_CHAT_MODEL = "accounts/fireworks/routers/kimi-k2p5-turbo";
// Embeddings: qwen3-embedding-8b. Native dim ≈ 4096; we take a Matryoshka
// slice via the `dimensions` parameter. 768 is a good balance for dedup —
// similar quality to the full vector for cosine at ~5× less storage.
const DEFAULT_EMBEDDING_MODEL = "accounts/fireworks/models/qwen3-embedding-8b";
const DEFAULT_EMBEDDING_DIMENSIONS = 768;

export class FireworksClient {
  readonly baseUrl: string;
  readonly defaultChatModel: string;
  readonly defaultEmbeddingModel: string;
  readonly defaultEmbeddingDimensions: number;

  private readonly apiKey: string;
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: FireworksConfig = {}) {
    const env = readNodeEnv();
    const key = config.apiKey ?? env.FIREWORKS_API_KEY;
    if (!key) throw new Error("FireworksClient requires FIREWORKS_API_KEY or apiKey");
    this.apiKey = key;
    this.baseUrl = (
      config.baseUrl ??
      env.FIREWORKS_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/$/, "");
    this.defaultChatModel =
      config.defaultChatModel ?? env.FIREWORKS_CHAT_MODEL ?? DEFAULT_CHAT_MODEL;
    this.defaultEmbeddingModel =
      config.defaultEmbeddingModel ??
      env.FIREWORKS_EMBEDDING_MODEL ??
      DEFAULT_EMBEDDING_MODEL;
    const envDim = env.FIREWORKS_EMBEDDING_DIMENSIONS;
    this.defaultEmbeddingDimensions =
      config.defaultEmbeddingDimensions ??
      (envDim ? Number(envDim) : DEFAULT_EMBEDDING_DIMENSIONS);
    // Bind fetch to its global to avoid "Illegal invocation" when assigned
    // to a property and invoked as `this.fetch(...)`.
    this.fetch = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  async chat(params: FireworksChatParams): Promise<FireworksChatResponse> {
    const messages: FireworksMessage[] = params.system
      ? [{ role: "system", content: params.system }, ...params.messages]
      : params.messages;
    const body: Record<string, unknown> = {
      model: params.model ?? this.defaultChatModel,
      messages,
      temperature: params.temperature ?? 0.6,
      max_tokens: params.maxTokens ?? 1500,
    };
    if (params.responseFormat) body.response_format = params.responseFormat;
    if (params.stop && params.stop.length > 0) body.stop = params.stop;

    const json = await this.postJson<{
      choices: Array<{
        message: { content: string };
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    }>("/chat/completions", body);

    const choice = json.choices[0];
    if (!choice) throw new Error("fireworks chat: empty choices array");
    return {
      text: choice.message.content ?? "",
      finishReason: choice.finish_reason ?? "stop",
      usage: json.usage,
      rawChoice: choice,
    };
  }

  async embed(params: FireworksEmbedParams): Promise<number[][]> {
    const input = Array.isArray(params.input) ? params.input : [params.input];
    if (input.length === 0) return [];
    const body: Record<string, unknown> = {
      model: params.model ?? this.defaultEmbeddingModel,
      input,
    };
    const dim = params.dimensions ?? this.defaultEmbeddingDimensions;
    if (dim > 0) body.dimensions = dim;

    const json = await this.postJson<{
      data: Array<{ embedding: number[] }>;
    }>("/embeddings", body);
    return json.data.map((d) => d.embedding);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`fireworks ${path} ${res.status}: ${detail.slice(0, 400)}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

let cachedClient: FireworksClient | null = null;

/** Lazy singleton — reuses one client across proposer/T3/embeddings calls. */
export function getFireworksClient(config: FireworksConfig = {}): FireworksClient | null {
  const env = readNodeEnv();
  const key = config.apiKey ?? env.FIREWORKS_API_KEY;
  if (!key) return null;
  if (cachedClient) return cachedClient;
  try {
    cachedClient = new FireworksClient(config);
    return cachedClient;
  } catch {
    return null;
  }
}

/** Browser-safe wrapper around process.env. Returns an empty record when
 *  process is undefined (i.e. running in the SPA bundle). Vite-side callers
 *  pass config directly so this only affects fallbacks. */
function readNodeEnv(): Record<string, string | undefined> {
  if (typeof process === "undefined" || !process.env) return {};
  return process.env as Record<string, string | undefined>;
}

export function resetFireworksClientForTests(client: FireworksClient | null): void {
  cachedClient = client;
}

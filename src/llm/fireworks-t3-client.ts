import { FireworksClient, getFireworksClient } from "./fireworks-client";
import { parseBatchResponse, renderBatchPrompt, T3_SYSTEM_PROMPT } from "./prompt";
import type { T3Client, T3Config, T3EntityContext, T3Response } from "./types";

export class FireworksT3Client implements T3Client {
  readonly live = true;
  private readonly client: FireworksClient;
  private readonly model: string;
  private readonly temperature: number;
  private readonly log: (msg: string) => void;

  constructor(config: T3Config & { model?: string; baseUrl?: string } = {}, sharedClient?: FireworksClient) {
    this.client =
      sharedClient ??
      new FireworksClient({ apiKey: config.apiKey, baseUrl: (config as { baseUrl?: string }).baseUrl });
    this.model = config.model ?? this.client.defaultChatModel;
    this.temperature = config.temperature ?? 0.7;
    this.log = config.logger ?? (() => undefined);
  }

  async selectActions(contexts: T3EntityContext[]): Promise<T3Response[]> {
    if (contexts.length === 0) return [];
    const userPrompt = renderBatchPrompt(contexts);
    this.log(`T3 call: ${contexts.length} entities`);
    const response = await this.client.chat({
      model: this.model,
      system: T3_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      temperature: this.temperature,
      maxTokens: Math.min(4000, 200 + contexts.length * 120),
      responseFormat: { type: "json_object" },
    });

    const actions = parseBatchResponse(response.text, contexts.map((c) => c.id));
    const out: T3Response[] = [];
    for (const ctx of contexts) {
      const action = actions.get(ctx.id);
      if (action) out.push({ entityId: ctx.id, action });
    }
    this.log(`T3 parsed ${out.length}/${contexts.length} actions`);
    return out;
  }
}

export function isFireworksConfigured(): boolean {
  return Boolean(process.env?.FIREWORKS_API_KEY);
}

export function tryCreateFireworksT3Client(config: T3Config = {}): FireworksT3Client | null {
  const shared = getFireworksClient({ apiKey: config.apiKey });
  if (!shared) return null;
  return new FireworksT3Client(config, shared);
}

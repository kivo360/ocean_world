import Anthropic from "@anthropic-ai/sdk";
import { parseBatchResponse, renderBatchPrompt, T3_SYSTEM_PROMPT } from "./prompt";
import type { T3Client, T3Config, T3EntityContext, T3Response } from "./types";

/**
 * Live T3 client that calls Anthropic's Messages API in a single batched call
 * per decide-phase. Entity contexts are delimiter-separated; the response is a
 * JSON array parsed into typed actions. Malformed blocks are dropped — the
 * caller falls back to deterministic T2 for any entity we didn't answer for.
 */
export class AnthropicT3Client implements T3Client {
  readonly live = true;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly temperature: number;
  private readonly log: (msg: string) => void;

  constructor(config: T3Config = {}) {
    const key = config.apiKey ?? process.env?.ANTHROPIC_API_KEY;
    if (!key) throw new Error("AnthropicT3Client requires ANTHROPIC_API_KEY");
    this.client = new Anthropic({ apiKey: key });
    this.model = config.model ?? "claude-sonnet-4-5-20250929";
    this.temperature = config.temperature ?? 0.7;
    this.log = config.logger ?? (() => undefined);
  }

  async selectActions(contexts: T3EntityContext[]): Promise<T3Response[]> {
    if (contexts.length === 0) return [];
    const userPrompt = renderBatchPrompt(contexts);
    this.log(`T3 call: ${contexts.length} entities`);
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: Math.min(4000, 200 + contexts.length * 120),
      temperature: this.temperature,
      system: T3_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = msg.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    const actions = parseBatchResponse(text, contexts.map((c) => c.id));
    const out: T3Response[] = [];
    for (const ctx of contexts) {
      const action = actions.get(ctx.id);
      if (action) out.push({ entityId: ctx.id, action });
    }
    this.log(`T3 parsed ${out.length}/${contexts.length} actions`);
    return out;
  }
}

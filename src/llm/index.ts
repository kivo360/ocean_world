import { AnthropicT3Client } from "./anthropic-client";
import { FireworksT3Client, tryCreateFireworksT3Client } from "./fireworks-t3-client";
import { StubT3Client } from "./stub-client";
import { T3Queue } from "./t3-queue";
import type { T3Client, T3Config } from "./types";

/**
 * T3 client factory. Provider priority:
 *   1. Fireworks (if FIREWORKS_API_KEY is set) — default
 *   2. Anthropic (if ANTHROPIC_API_KEY is set) — fallback for compatibility
 *   3. StubT3Client — offline deterministic
 */
export function createT3Client(config: T3Config = {}): T3Client {
  const fireworks = tryCreateFireworksT3Client(config);
  if (fireworks) return fireworks;

  const anthropicKey = config.apiKey ?? process.env?.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      return new AnthropicT3Client({ ...config, apiKey: anthropicKey });
    } catch {
      return new StubT3Client();
    }
  }
  return new StubT3Client();
}

export { AnthropicT3Client, FireworksT3Client, StubT3Client, T3Queue };
export { FireworksClient, getFireworksClient } from "./fireworks-client";
export { buildT3Context } from "./types";
export { renderBatchPrompt, parseBatchResponse, T3_SYSTEM_PROMPT } from "./prompt";
export type { T3Client, T3Config, T3EntityContext, T3Response, T3SelectedAction } from "./types";

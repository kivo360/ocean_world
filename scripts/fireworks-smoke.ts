#!/usr/bin/env tsx
// Live smoke test against Fireworks. Hits both /chat/completions and
// /embeddings to confirm the key + models + dimensions resolve correctly.

import { FireworksClient } from "../src/llm/fireworks-client";
import { cosineSimilarity } from "../src/orchestrator/embeddings";

const client = new FireworksClient();
console.log(
  `base=${client.baseUrl}  chat=${client.defaultChatModel}  embed=${client.defaultEmbeddingModel}@${client.defaultEmbeddingDimensions}d`,
);

const chatStart = Date.now();
const chat = await client.chat({
  system: "Reply in exactly five words, no punctuation.",
  messages: [{ role: "user", content: "describe an ocean world simulation" }],
  temperature: 0.2,
  maxTokens: 40,
});
console.log(
  `\nchat (${Date.now() - chatStart}ms, ${chat.usage.total_tokens}tk): ${chat.text.trim()}`,
);

const embedStart = Date.now();
const [vA, vB, vC] = await client.embed({
  input: [
    "a merchant offering goods for sale",
    "a trader bargaining over a price",
    "a wandering philosopher reading clouds",
  ],
});
console.log(
  `\nembed (${Date.now() - embedStart}ms, dim=${vA!.length})` +
    `\n  sim(trade-like, trade-like) = ${cosineSimilarity(vA!, vB!).toFixed(3)}` +
    `\n  sim(trade-like, wanderer)   = ${cosineSimilarity(vA!, vC!).toFixed(3)}`,
);

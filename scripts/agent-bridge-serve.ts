#!/usr/bin/env tsx
// Stand up the agent bridge HTTP server for an external coding agent to drive.
// Runs with the in-memory repo by default; set SURREAL_URL to persist.
//
// Tool calls: POST http://localhost:4321/tools/<name>  body = { ...input }
// Schemas:    GET  http://localhost:4321/tools
// Health:     GET  http://localhost:4321/health

import { createAgentBridgeServer } from "../src/agent-bridge/server";
import { createRepositoryFromEnv } from "../src/storage";
import { createT3Client, T3Queue } from "../src/llm";

const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? "0.0.0.0";

const repo = await createRepositoryFromEnv({
  initialPersons: Number(process.env.INITIAL_PERSONS ?? 70),
  initialMerchants: Number(process.env.INITIAL_MERCHANTS ?? 8),
  initialWanderers: Number(process.env.INITIAL_WANDERERS ?? 22),
});

// Optional T3 queue — enabled when an LLM provider is configured.
const hasLlmProvider = process.env.FIREWORKS_API_KEY || process.env.ANTHROPIC_API_KEY;
if (repo.kind === "memory" && hasLlmProvider) {
  const client = createT3Client();
  const queue = new T3Queue(client, 12, (m) => console.log(`[t3] ${m}`));
  (repo as never as { setT3Queue(q: T3Queue | null): void }).setT3Queue(queue);
  const providerName = process.env.FIREWORKS_API_KEY ? "Fireworks" : "Anthropic";
  console.log(`T3 client: ${client.live ? `${providerName} live` : "stub"}`);
}

const server = createAgentBridgeServer(repo);
await server.listen(port, host);
console.log(`Ocean World agent bridge on http://${host}:${port}`);
console.log(`Tools: GET /tools  |  POST /tools/<name>  |  Health: GET /health`);

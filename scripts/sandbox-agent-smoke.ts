#!/usr/bin/env tsx
// Live smoke test against a running Sandbox Agent server.
// Verifies: gateway connects, session starts, prompt returns JSON we can parse.

import { SandboxAgentGateway } from "../src/sandbox-agent/gateway";

const gateway = new SandboxAgentGateway({ logger: (m) => console.log(`[gw] ${m}`) });

const start = Date.now();
const result = await gateway.runSingleTurn(
  `Respond with strict JSON only. No prose, no markdown, no commentary.
Return this exact shape with values you choose:
{"pick":"one of: north, south, east, west","rationale":"under 8 words"}`,
);
console.log(
  `\nresult (${Date.now() - start}ms, session=${result.sessionId}, stopReason=${result.stopReason}, events=${result.rawEvents})`,
);
console.log(`text: ${result.text.slice(0, 500)}`);

try {
  // Find JSON object in response.
  const match = result.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object found");
  const parsed = JSON.parse(match[0]);
  console.log(`\nparsed:`, parsed);
} catch (err) {
  console.warn(`parse failed: ${(err as Error).message}`);
}

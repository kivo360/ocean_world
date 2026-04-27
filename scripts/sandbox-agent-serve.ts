#!/usr/bin/env tsx
// Convenience wrapper that boots a Sandbox Agent server on the configured URL.
// For local dev this spawns `sandbox-agent server` via npx; in production you
// would run the binary directly or point SANDBOX_AGENT_URL at a remote server.
//
// Usage:
//   npm run sandbox:serve
//
// Env:
//   SANDBOX_AGENT_PORT  (default 2468)
//   SANDBOX_AGENT_HOST  (default 0.0.0.0)
//   SANDBOX_AGENT_TOKEN (optional; omit for --no-token)

import { spawn } from "node:child_process";

const port = process.env.SANDBOX_AGENT_PORT ?? "2468";
const host = process.env.SANDBOX_AGENT_HOST ?? "0.0.0.0";
const token = process.env.SANDBOX_AGENT_TOKEN;

const args = ["@sandbox-agent/cli@0.4.x", "server", "--host", host, "--port", port];
if (token) {
  args.push("--token", token);
} else {
  args.push("--no-token");
}

console.log(`starting sandbox-agent: npx ${args.join(" ")}`);
const child = spawn("npx", args, { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

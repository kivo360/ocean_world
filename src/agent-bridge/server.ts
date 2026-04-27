// Minimal zero-dep HTTP server exposing the agent bridge tools.
// Uses Node's built-in http module so we don't pull in Express for D3.
//
// Endpoints:
//   GET  /tools                 — list tool schemas
//   POST /tools/:name           — invoke a tool with JSON body
//   GET  /world/snapshot        — entity snapshots for external renderers
//   GET  /world/events?sinceTick=  — event stream
//   GET  /health                — { ok: true, tick, entities }

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Repository } from "../storage/repository";
import { createHandlers } from "./handlers";
import { TOOL_SCHEMAS } from "./tool-schemas";
import type { ToolCall } from "./types";

export type ServerOptions = {
  port?: number;
  host?: string;
  logger?: (msg: string) => void;
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      if (!body) return resolve({} as T);
      try {
        resolve(JSON.parse(body) as T);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function createAgentBridgeServer(repo: Repository, opts: ServerOptions = {}) {
  const handlers = createHandlers(repo);
  const log = opts.logger ?? ((m: string) => console.log(`[agent-bridge] ${m}`));

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        sendJson(res, 204, {});
        return;
      }
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (url.pathname === "/health") {
        const stats = await repo.stats();
        sendJson(res, 200, { ok: true, ...stats });
        return;
      }

      if (url.pathname === "/tools" && req.method === "GET") {
        sendJson(res, 200, { tools: TOOL_SCHEMAS });
        return;
      }

      if (url.pathname.startsWith("/tools/") && req.method === "POST") {
        const toolName = url.pathname.slice("/tools/".length);
        const input = await readJson<Record<string, unknown>>(req);
        const call = { tool: toolName, input } as ToolCall;
        const handler = handlers[call.tool] as ((input: unknown) => Promise<unknown>) | undefined;
        if (!handler) {
          sendJson(res, 404, { ok: false, error: `unknown tool: ${toolName}` });
          return;
        }
        try {
          const data = await handler(call.input);
          sendJson(res, 200, { ok: true, data });
        } catch (err) {
          sendJson(res, 400, { ok: false, error: (err as Error).message });
        }
        return;
      }

      if (url.pathname === "/world/snapshot" && req.method === "GET") {
        const snap = await repo.snapshot();
        sendJson(res, 200, { snapshot: snap });
        return;
      }

      if (url.pathname === "/world/events" && req.method === "GET") {
        const sinceTick = url.searchParams.get("sinceTick");
        const kind = url.searchParams.get("kind");
        const limit = url.searchParams.get("limit");
        const events = await repo.listEvents({
          sinceTick: sinceTick ? Number(sinceTick) : undefined,
          kind: kind ?? undefined,
          limit: limit ? Number(limit) : 100,
        });
        sendJson(res, 200, { events });
        return;
      }

      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: (err as Error).message });
    }
  });

  return {
    listen(port = opts.port ?? 4321, host = opts.host ?? "0.0.0.0"): Promise<void> {
      return new Promise((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, host, () => {
          log(`listening on http://${host}:${port}`);
          resolve();
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve) => server.close(() => resolve()));
    },
    server,
  };
}

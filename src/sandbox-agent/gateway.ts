// Sandbox Agent gateway. Wraps the sandbox-agent SDK so downstream consumers
// (critic, observer, coding-agent bridge) don't have to know about session
// lifecycle, event streaming, or partial message accumulation.
//
// Configured via SANDBOX_AGENT_URL (default http://127.0.0.1:2468). The SDK
// stays optional at runtime: if the sandbox-agent server is not running we
// surface a clear error so callers can fall back to stubs.

import { SandboxAgent, type SessionEvent } from "sandbox-agent";

export type SandboxGatewayConfig = {
  baseUrl?: string;
  agent?: string; // "claude" | "codex" | "opencode" | "amp"
  cwd?: string;
  mcpServers?: SandboxMcpServerConfig[];
  logger?: (msg: string) => void;
  connectTimeoutMs?: number;
  promptTimeoutMs?: number;
};

export type SandboxMcpServerConfig = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type SandboxPromptResult = {
  text: string;
  stopReason: string;
  sessionId: string;
  durationMs: number;
  rawEvents: number;
};

/**
 * Single shared gateway. Lazy-connects on first use; `ensure()` reuses an
 * existing connection across many runSingleTurn calls (critic/observer
 * typically make hundreds of calls in one evolve run).
 */
export class SandboxAgentGateway {
  private sdk: SandboxAgent | null = null;
  private readonly config: Required<
    Pick<SandboxGatewayConfig, "baseUrl" | "agent" | "cwd" | "mcpServers" | "connectTimeoutMs" | "promptTimeoutMs">
  >;
  private readonly log: (msg: string) => void;

  constructor(config: SandboxGatewayConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? process.env?.SANDBOX_AGENT_URL ?? "http://127.0.0.1:2468",
      agent: config.agent ?? process.env?.SANDBOX_AGENT_NAME ?? "claude",
      cwd: config.cwd ?? "/",
      mcpServers: config.mcpServers ?? [],
      connectTimeoutMs: config.connectTimeoutMs ?? 8_000,
      promptTimeoutMs: config.promptTimeoutMs ?? 60_000,
    };
    this.log = config.logger ?? (() => undefined);
  }

  async ensure(): Promise<SandboxAgent> {
    if (this.sdk) return this.sdk;
    this.log(`connecting to sandbox-agent at ${this.config.baseUrl}`);
    this.sdk = await SandboxAgent.connect({
      baseUrl: this.config.baseUrl,
    });
    return this.sdk;
  }

  async close(): Promise<void> {
    this.sdk = null;
  }

  /**
   * Run a single-turn session: create, prompt, collect final agent text.
   * Intended for stateless JSON-producing prompts (critic verdict, gap report).
   */
  async runSingleTurn(promptText: string, opts: {
    systemPrompt?: string;
    agent?: string;
    cwd?: string;
    mcpServers?: SandboxMcpServerConfig[];
  } = {}): Promise<SandboxPromptResult> {
    const sdk = await this.ensure();
    const agent = opts.agent ?? this.config.agent;
    const cwd = opts.cwd ?? this.config.cwd;
    const mcpServers = opts.mcpServers ?? this.config.mcpServers;

    this.log(`creating ${agent} session (cwd=${cwd}, mcpServers=${mcpServers.length})`);
    const session = await sdk.createSession({
      agent,
      sessionInit: {
        cwd,
        mcpServers: mcpServers.map((m) => ({
          name: m.name,
          command: m.command,
          args: m.args ?? [],
          env: Object.entries(m.env ?? {}).map(([key, value]) => ({ name: key, value })),
        })) as never,
      },
    });

    const startedAt = Date.now();
    let accumulated = "";
    let rawEvents = 0;

    const unsubscribe = session.onEvent((event: SessionEvent) => {
      rawEvents++;
      const chunk = extractAgentMessageChunk(event);
      if (chunk) accumulated += chunk;
    });

    try {
      const fullPrompt = opts.systemPrompt
        ? `${opts.systemPrompt}\n\n---\n\n${promptText}`
        : promptText;

      const result = await withTimeout(
        session.prompt([{ type: "text", text: fullPrompt }]),
        this.config.promptTimeoutMs,
        `sandbox-agent prompt timed out after ${this.config.promptTimeoutMs}ms`,
      );

      return {
        text: accumulated.trim(),
        stopReason: (result as { stopReason?: string }).stopReason ?? "end_turn",
        sessionId: session.id,
        durationMs: Date.now() - startedAt,
        rawEvents,
      };
    } finally {
      unsubscribe();
    }
  }

  getConfig(): typeof this.config {
    return this.config;
  }
}

function extractAgentMessageChunk(event: SessionEvent): string | null {
  if (event.sender !== "agent") return null;
  const payload = event.payload as Record<string, unknown> | undefined;
  if (!payload) return null;
  const params = payload.params as Record<string, unknown> | undefined;
  const update = params?.update as Record<string, unknown> | undefined;
  if (!update) return null;
  const kind = update.sessionUpdate;
  if (kind !== "agent_message_chunk") return null;
  const content = update.content as Record<string, unknown> | undefined;
  const text = content?.text;
  return typeof text === "string" ? text : null;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// -----------------------------------------------------------------------------

let cachedGateway: SandboxAgentGateway | null = null;

/** Lazy singleton. Returns null when SANDBOX_AGENT_URL is not set. */
export function getSandboxAgentGateway(config: SandboxGatewayConfig = {}): SandboxAgentGateway | null {
  const url = config.baseUrl ?? process.env?.SANDBOX_AGENT_URL;
  if (!url) return null;
  if (cachedGateway) return cachedGateway;
  cachedGateway = new SandboxAgentGateway(config);
  return cachedGateway;
}

export function resetSandboxGatewayForTests(gateway: SandboxAgentGateway | null): void {
  cachedGateway = gateway;
}

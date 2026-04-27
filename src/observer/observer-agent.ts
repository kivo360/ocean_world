import Anthropic from "@anthropic-ai/sdk";
import type { OntologyRegistry } from "../ontology/registry";
import {
  getSandboxAgentGateway,
  type SandboxAgentGateway,
} from "../sandbox-agent/gateway";
import type { Repository } from "../storage/repository";
import { collectAllSignals, computeDomainPressure } from "./gap-detectors";
import type { GapReport, GapSignal } from "./types";
import type { Domain } from "../ontology/types";

export type ObserverClient = {
  readonly live: boolean;
  observe(args: {
    repo: Repository;
    registry: OntologyRegistry;
    sinceTick: number;
    endTick: number;
  }): Promise<GapReport>;
};

export type ObserverConfig = {
  apiKey?: string;
  model?: string;
  temperature?: number;
};

/**
 * DeterministicObserver composes the direct-code gap detectors into a report.
 * This is the default observer; no LLM calls. It's cheap, fast, and surfaces
 * gap signals deterministically — good for every-tick monitoring.
 */
export class DeterministicObserver implements ObserverClient {
  readonly live = false;
  async observe(args: {
    repo: Repository;
    registry: OntologyRegistry;
    sinceTick: number;
    endTick: number;
  }): Promise<GapReport> {
    const signals = await collectAllSignals(args);
    return {
      sinceTick: args.sinceTick,
      endTick: args.endTick,
      signals,
      domainPressure: computeDomainPressure(signals),
    };
  }
}

const OBSERVER_SYSTEM = `You are the ontology observer for Ocean World. Given deterministic gap signals and a sample of event history, identify what's missing from the ontology and where.

Return a JSON object:
{ "signals": [ { "kind": "...", "severity": "low"|"medium"|"high", "domain": "...", "evidence": "...", "suggestion": "..." } ],
  "domain_pressure": { "<domain>": <score> } }

Focus on gaps not already covered by the deterministic signals. Be terse. No markdown, no prose outside the JSON.`;

/**
 * LLM-augmented observer. Runs the deterministic detectors first, then lets
 * Claude annotate/augment with signals the heuristics missed. Batched into a
 * single LLM call per observation pass.
 */
export class AnthropicObserver implements ObserverClient {
  readonly live = true;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly temperature: number;
  private readonly baseline: DeterministicObserver;

  constructor(config: ObserverConfig = {}) {
    const key = config.apiKey ?? process.env?.ANTHROPIC_API_KEY;
    if (!key) throw new Error("AnthropicObserver requires ANTHROPIC_API_KEY");
    this.client = new Anthropic({ apiKey: key });
    this.model = config.model ?? "claude-sonnet-4-5-20250929";
    this.temperature = config.temperature ?? 0.3;
    this.baseline = new DeterministicObserver();
  }

  async observe(args: {
    repo: Repository;
    registry: OntologyRegistry;
    sinceTick: number;
    endTick: number;
  }): Promise<GapReport> {
    const deterministic = await this.baseline.observe(args);
    const events = await args.repo.listEvents({ sinceTick: args.sinceTick, limit: 60 });
    const bundle = args.registry.getBundle();

    const prompt = `DETERMINISTIC SIGNALS (already found):
${deterministic.signals.map((s) => `- [${s.severity}] ${s.kind} in ${s.domain}: ${s.evidence}`).join("\n") || "(none)"}

ONTOLOGY SNAPSHOT:
components: ${bundle.components.map((c) => c.name).join(", ")}
behaviors: ${bundle.behaviors.map((b) => b.name).join(", ")}
archetypes: ${bundle.archetypes.map((a) => a.name).join(", ")}

RECENT EVENTS (last 60 in window):
${events.map((e) => `t${e.tick} ${e.kind} ${e.source}${e.target ? ` -> ${e.target}` : ""}: ${e.summary}`).join("\n")}

Return the JSON now.`;

    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      temperature: this.temperature,
      system: OBSERVER_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");
    const augmented = parseObserverResponse(text);

    const merged: GapSignal[] = [...deterministic.signals, ...augmented.signals];
    const pressure = { ...deterministic.domainPressure };
    for (const [k, v] of Object.entries(augmented.domainPressure)) {
      pressure[k as Domain] = (pressure[k as Domain] ?? 0) + v!;
    }
    return {
      sinceTick: args.sinceTick,
      endTick: args.endTick,
      signals: merged,
      domainPressure: pressure,
    };
  }
}

/**
 * SandboxAgentObserver — the SDK-agent variant per docs/09.
 *
 * Runs the deterministic detectors first (free, fast, reliable), then hands
 * the results + event log to a Sandbox Agent session that can augment with
 * open-ended signals. This is where multi-step tool use shines: the agent can
 * follow up on anomalies via MCP tools exposed by the agent bridge.
 */
export class SandboxAgentObserver implements ObserverClient {
  readonly live = true;
  private readonly gateway: SandboxAgentGateway;
  private readonly baseline: DeterministicObserver;

  constructor(gateway: SandboxAgentGateway) {
    this.gateway = gateway;
    this.baseline = new DeterministicObserver();
  }

  async observe(args: {
    repo: Repository;
    registry: OntologyRegistry;
    sinceTick: number;
    endTick: number;
  }): Promise<GapReport> {
    const deterministic = await this.baseline.observe(args);
    const events = await args.repo.listEvents({ sinceTick: args.sinceTick, limit: 60 });
    const bundle = args.registry.getBundle();

    const prompt = `${OBSERVER_SYSTEM}

DETERMINISTIC SIGNALS (already found — augment, don't repeat):
${deterministic.signals.map((s) => `- [${s.severity}] ${s.kind} in ${s.domain}: ${s.evidence}`).join("\n") || "(none)"}

ONTOLOGY SNAPSHOT:
components: ${bundle.components.map((c) => c.name).join(", ")}
behaviors: ${bundle.behaviors.map((b) => b.name).join(", ")}
archetypes: ${bundle.archetypes.map((a) => a.name).join(", ")}

RECENT EVENTS (last 60 in window):
${events.map((e) => `t${e.tick} ${e.kind} ${e.source}${e.target ? ` -> ${e.target}` : ""}: ${e.summary}`).join("\n")}

Return the JSON now.`;

    try {
      const result = await this.gateway.runSingleTurn(prompt);
      const augmented = parseObserverResponse(result.text);
      const merged: GapSignal[] = [...deterministic.signals, ...augmented.signals];
      const pressure = { ...deterministic.domainPressure };
      for (const [k, v] of Object.entries(augmented.domainPressure)) {
        pressure[k as Domain] = (pressure[k as Domain] ?? 0) + (v ?? 0);
      }
      return {
        sinceTick: args.sinceTick,
        endTick: args.endTick,
        signals: merged,
        domainPressure: pressure,
      };
    } catch {
      // Fall back to deterministic signals on any sandbox failure.
      return deterministic;
    }
  }
}

/**
 * Observer factory. Priority:
 *   1. Sandbox Agent (SANDBOX_AGENT_URL) — SDK agent per design docs
 *   2. Anthropic direct (ANTHROPIC_API_KEY) — compatibility
 *   3. Deterministic detectors only
 */
export function createObserver(config: ObserverConfig = {}): ObserverClient {
  const gateway = getSandboxAgentGateway();
  if (gateway) return new SandboxAgentObserver(gateway);

  const anthropicKey = config.apiKey ?? process.env?.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      return new AnthropicObserver({ ...config, apiKey: anthropicKey });
    } catch {
      return new DeterministicObserver();
    }
  }
  return new DeterministicObserver();
}

const VALID_DOMAINS: ReadonlySet<Domain> = new Set<Domain>([
  "economic",
  "social",
  "cognitive",
  "governance",
  "environmental",
  "organizational",
]);

function isValidDomain(value: unknown): value is Domain {
  return typeof value === "string" && VALID_DOMAINS.has(value as Domain);
}

function parseObserverResponse(text: string): {
  signals: GapSignal[];
  domainPressure: Partial<Record<Domain, number>>;
} {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) body = fence[1]!;
  const firstBrace = body.indexOf("{");
  if (firstBrace > 0) body = body.slice(firstBrace);
  try {
    const parsed = JSON.parse(body) as { signals?: unknown; domain_pressure?: unknown };
    const signals: GapSignal[] = Array.isArray(parsed.signals)
      ? (parsed.signals.filter((s): s is GapSignal => {
          if (!s || typeof s !== "object") return false;
          const rec = s as Record<string, unknown>;
          return typeof rec.kind === "string" && isValidDomain(rec.domain);
        }) as GapSignal[])
      : [];
    const domainPressure: Partial<Record<Domain, number>> = {};
    if (parsed.domain_pressure && typeof parsed.domain_pressure === "object") {
      for (const [k, v] of Object.entries(parsed.domain_pressure as Record<string, unknown>)) {
        if (typeof v === "number" && isValidDomain(k)) domainPressure[k] = v;
      }
    }
    return { signals, domainPressure };
  } catch {
    return { signals: [], domainPressure: {} };
  }
}

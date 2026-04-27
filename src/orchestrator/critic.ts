import Anthropic from "@anthropic-ai/sdk";
import type { OntologyRegistry } from "../ontology/registry";
import {
  getSandboxAgentGateway,
  type SandboxAgentGateway,
} from "../sandbox-agent/gateway";
import type { Candidate, Verdict } from "./types";

// The critic is an SDK-agent-shaped component. In offline mode it's a
// deterministic rule set. In live mode it delegates to Claude with a small tool
// loop: sparql_query, shacl_validate, surreal_query. For D5 we ship the
// direct-call variant — the tool-loop version requires the Anthropic Agents API
// which is orthogonal to the orchestrator logic.

export type CriticClient = {
  readonly live: boolean;
  adjudicate(
    candidate: Candidate,
    nearest: { id: string; similarity: number } | undefined,
    registry: OntologyRegistry,
  ): Promise<Verdict>;
};

export type CriticConfig = {
  apiKey?: string;
  model?: string;
  temperature?: number;
};

const CRITIC_SYSTEM = `You are the ontology critic for Ocean World. You adjudicate candidate concepts in the 0.80–0.90 cosine-similarity deliberation zone — the embedding says maybe-duplicate, and you decide.

For each candidate you output a strict JSON object:
{ "decision": "accept" | "reject" | "merge",
  "reason": "one short sentence",
  "merge_target": "ecs:ExistingId | null" }

Acceptance criteria:
- "accept" when the candidate is a legitimate specialization or captures a clearly-distinct aspect.
- "merge" when the candidate overlaps so strongly with an existing concept that keeping both adds no signal. Use existing @id as merge_target.
- "reject" when the candidate is redundant AND low-quality.

No prose, no markdown. Just the JSON.`;

export class AnthropicCritic implements CriticClient {
  readonly live = true;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly temperature: number;

  constructor(config: CriticConfig = {}) {
    const key = config.apiKey ?? process.env?.ANTHROPIC_API_KEY;
    if (!key) throw new Error("AnthropicCritic requires ANTHROPIC_API_KEY");
    this.client = new Anthropic({ apiKey: key });
    this.model = config.model ?? "claude-sonnet-4-5-20250929";
    this.temperature = config.temperature ?? 0.2;
  }

  async adjudicate(
    candidate: Candidate,
    nearest: { id: string; similarity: number } | undefined,
    registry: OntologyRegistry,
  ): Promise<Verdict> {
    const nearestDoc = nearest
      ? registry.getComponent(nearest.id) ?? registry.getBehavior(nearest.id)
      : undefined;

    const prompt = `CANDIDATE
kind: ${candidate.kind}
name: ${candidate.name}
domain: ${candidate.domain}
description: ${candidate.description}
data: ${JSON.stringify(candidate.data, null, 2)}

NEAREST EXISTING (cosine similarity ${nearest?.similarity.toFixed(3) ?? "n/a"})
${nearestDoc ? JSON.stringify(nearestDoc, null, 2) : "(none)"}

Return the JSON verdict now.`;

    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 400,
      temperature: this.temperature,
      system: CRITIC_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");
    return parseCriticResponse(text, nearest?.id);
  }
}

/** Offline deterministic critic: accept unless similarity > 0.87, then merge. */
export class StubCritic implements CriticClient {
  readonly live = false;
  async adjudicate(
    candidate: Candidate,
    nearest: { id: string; similarity: number } | undefined,
  ): Promise<Verdict> {
    if (nearest && nearest.similarity >= 0.87) {
      return {
        decision: "merge",
        reason: `stub critic: cosine ${nearest.similarity.toFixed(3)} ≥ 0.87 → merge`,
        zone: "deliberation",
        mergeTargetId: nearest.id,
        gateFailures: [],
      };
    }
    return {
      decision: "accept",
      reason: `stub critic: ${candidate.name} judged novel in deliberation zone`,
      zone: "deliberation",
      gateFailures: [],
    };
  }
}

/**
 * SandboxAgentCritic — the SDK-agent variant per docs/09.
 *
 * Runs inside a Sandbox Agent session (Claude Code / Codex / OpenCode / Amp).
 * For each deliberation-zone candidate, we open a single-turn session and ask
 * for a strict JSON verdict. Multi-step tool use is supported by the sandbox
 * but not strictly required for the current gate set — we keep the prompt
 * self-contained so the agent can answer in one turn.
 */
export class SandboxAgentCritic implements CriticClient {
  readonly live = true;
  private readonly gateway: SandboxAgentGateway;

  constructor(gateway: SandboxAgentGateway) {
    this.gateway = gateway;
  }

  async adjudicate(
    candidate: Candidate,
    nearest: { id: string; similarity: number } | undefined,
    registry: OntologyRegistry,
  ): Promise<Verdict> {
    const nearestDoc = nearest
      ? registry.getComponent(nearest.id) ?? registry.getBehavior(nearest.id)
      : undefined;
    const prompt = `${CRITIC_SYSTEM}

CANDIDATE
kind: ${candidate.kind}
name: ${candidate.name}
domain: ${candidate.domain}
description: ${candidate.description}
data: ${JSON.stringify(candidate.data, null, 2)}

NEAREST EXISTING (cosine similarity ${nearest?.similarity.toFixed(3) ?? "n/a"})
${nearestDoc ? JSON.stringify(nearestDoc, null, 2) : "(none)"}

Return the JSON verdict now. No prose.`;

    try {
      const result = await this.gateway.runSingleTurn(prompt);
      return parseCriticResponse(result.text, nearest?.id);
    } catch (err) {
      return {
        decision: "reject",
        reason: `sandbox-agent critic failed: ${(err as Error).message}`,
        zone: "deliberation",
        mergeTargetId: nearest?.id,
        gateFailures: ["sandbox_unavailable"],
      };
    }
  }
}

/**
 * Critic factory. Priority:
 *   1. Sandbox Agent (SANDBOX_AGENT_URL) — SDK-agent per design docs
 *   2. Anthropic direct (ANTHROPIC_API_KEY) — compatibility
 *   3. Stub
 */
export function createCritic(config: CriticConfig = {}): CriticClient {
  const gateway = getSandboxAgentGateway();
  if (gateway) return new SandboxAgentCritic(gateway);

  const anthropicKey = config.apiKey ?? process.env?.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      return new AnthropicCritic({ ...config, apiKey: anthropicKey });
    } catch {
      return new StubCritic();
    }
  }
  return new StubCritic();
}

function parseCriticResponse(text: string, fallbackMerge?: string): Verdict {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) body = fence[1]!;
  const firstBrace = body.indexOf("{");
  if (firstBrace > 0) body = body.slice(firstBrace);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {
      decision: "reject",
      reason: `critic returned unparseable JSON`,
      zone: "deliberation",
      gateFailures: ["critic_parse"],
    };
  }
  const decision = parsed.decision;
  if (decision !== "accept" && decision !== "reject" && decision !== "merge") {
    return {
      decision: "reject",
      reason: `critic returned invalid decision: ${String(decision)}`,
      zone: "deliberation",
      gateFailures: ["critic_invalid"],
    };
  }
  return {
    decision,
    reason: typeof parsed.reason === "string" ? parsed.reason : "critic verdict",
    zone: "deliberation",
    mergeTargetId:
      typeof parsed.merge_target === "string" ? parsed.merge_target : fallbackMerge,
    gateFailures: [],
  };
}

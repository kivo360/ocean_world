import Anthropic from "@anthropic-ai/sdk";
import { FireworksClient, getFireworksClient } from "../llm/fireworks-client";
import type { Domain, BehaviorDoc, ComponentDoc } from "../ontology/types";
import type {
  Candidate,
  ProposerBatch,
  RAGContext,
  Strategy,
} from "./types";

export type ProposerClient = {
  readonly live: boolean;
  propose(ctx: RAGContext, batchSize: number): Promise<ProposerBatch>;
};

export type ProposerConfig = {
  apiKey?: string;
  model?: string;
  temperature?: number;
};

const PROPOSER_SYSTEM = `You are the ontology proposer for Ocean World, a living socio-economic simulation.

You generate JSON-LD candidates for components, behaviors, and archetypes. Your output must be a single JSON object:

{ "reasoning": "why these candidates address the domain gap", "candidates": [...] }

Each candidate has:
  { "kind": "component" | "behavior" | "archetype",
    "name": "<PascalCase>",
    "domain": "economic|social|cognitive|governance|environmental|organizational",
    "description": "one-line description",
    "data": { ... full JSON-LD payload ... } }

For components: data must include @id (ecs:Name), @type [ecs:Component, owl:Class], name, category (state|resource|relation|capability), domain, description, fields (1-8 entries with name+type), composable_with (optional).

For behaviors: data must include @id, @type [ecs:Behavior, owl:Class], name, domain, description, required_components (all ecs:... ids), reads, writes, actions (array with at least one), state_machine (states >= 2, initial in states, transitions >= 1).

For archetypes: data must include @id, @type [ecs:Archetype, owl:Class], name, scale (micro|meso|macro), components (ecs:... ids), behaviors (ecs:... ids).

Do NOT rediscover existing concepts. Do NOT repeat previously rejected names. Prefer novel coverage that fills the current domain gap.`;

export class AnthropicProposer implements ProposerClient {
  readonly live = true;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly temperature: number;

  constructor(config: ProposerConfig = {}) {
    const key = config.apiKey ?? process.env?.ANTHROPIC_API_KEY;
    if (!key) throw new Error("AnthropicProposer requires ANTHROPIC_API_KEY");
    this.client = new Anthropic({ apiKey: key });
    this.model = config.model ?? "claude-sonnet-4-5-20250929";
    this.temperature = config.temperature ?? 0.6;
  }

  async propose(ctx: RAGContext, batchSize: number): Promise<ProposerBatch> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      temperature: this.temperature,
      system: PROPOSER_SYSTEM,
      messages: [{ role: "user", content: renderProposerPrompt(ctx, batchSize) }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");
    return parseProposerResponse(text);
  }
}

/**
 * Offline fallback: generates deterministic placeholder candidates based on
 * domain seeds. Good enough to exercise the orchestrator loop in tests.
 */
export class StubProposer implements ProposerClient {
  readonly live = false;
  private readonly rng: () => number;
  private counter = 0;

  constructor(seed = 12345) {
    let state = seed >>> 0;
    this.rng = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  async propose(ctx: RAGContext, batchSize: number): Promise<ProposerBatch> {
    const candidates: Candidate[] = [];
    const pool = CANDIDATE_POOL[ctx.domain];
    if (!pool) return { reasoning: "no seed pool", candidates: [] };
    for (let i = 0; i < batchSize; i++) {
      const idx = Math.floor(this.rng() * pool.length);
      const seed = pool[idx]!;
      // Suffix to avoid collision with recent outputs.
      const suffix = Math.floor(this.rng() * 1000);
      const name = `${seed.name}${suffix}_${++this.counter}`;
      if (ctx.rejected.some((r) => r.name === name) || ctx.existing.some((e) => e.name === name)) {
        continue;
      }
      candidates.push(buildCandidateFromSeed(seed, name, ctx.domain));
    }
    return {
      reasoning: `stub proposer filled ${candidates.length} slots for ${ctx.domain} (${ctx.strategy})`,
      candidates,
    };
  }
}

export class FireworksProposer implements ProposerClient {
  readonly live = true;
  private readonly client: FireworksClient;
  private readonly model: string;
  private readonly temperature: number;

  constructor(config: ProposerConfig = {}, sharedClient?: FireworksClient) {
    this.client =
      sharedClient ??
      new FireworksClient({ apiKey: config.apiKey });
    this.model = config.model ?? this.client.defaultChatModel;
    this.temperature = config.temperature ?? 0.6;
  }

  async propose(ctx: RAGContext, batchSize: number): Promise<ProposerBatch> {
    const response = await this.client.chat({
      model: this.model,
      system: PROPOSER_SYSTEM,
      messages: [{ role: "user", content: renderProposerPrompt(ctx, batchSize) }],
      temperature: this.temperature,
      maxTokens: 4000,
      responseFormat: { type: "json_object" },
    });
    return parseProposerResponse(response.text);
  }
}

/**
 * Proposer factory. Priority:
 *   1. Fireworks (FIREWORKS_API_KEY) — default per user config
 *   2. Anthropic (ANTHROPIC_API_KEY) — fallback
 *   3. Stub
 */
export function createProposer(config: ProposerConfig = {}): ProposerClient {
  const fireworks = getFireworksClient({ apiKey: config.apiKey });
  if (fireworks) return new FireworksProposer(config, fireworks);

  const anthropicKey = config.apiKey ?? process.env?.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      return new AnthropicProposer({ ...config, apiKey: anthropicKey });
    } catch {
      return new StubProposer();
    }
  }
  return new StubProposer();
}

// -------------------------------------------------------------------------

export function renderProposerPrompt(ctx: RAGContext, batchSize: number): string {
  const existing = ctx.existing.map((d) => `- ${d.name}: ${d.description}`).join("\n") || "(none)";
  const siblings = ctx.siblings.map((d) => `- ${d.name} (${d.domain}): ${d.description}`).join("\n") || "(none)";
  const rejected = ctx.rejected.map((r) => `- ${r.name} (${r.kind}): ${r.reason}`).join("\n") || "(none)";
  const strategyHint = STRATEGY_HINTS[ctx.strategy];

  return `DOMAIN: ${ctx.domain}
STRATEGY: ${ctx.strategy} — ${strategyHint}
BATCH SIZE: produce ${batchSize} candidates.

=== existing concepts in this domain ===
${existing}

=== concepts from sibling domains (for cross-pollination, reference only) ===
${siblings}

=== recently rejected candidates (do NOT propose these again) ===
${rejected}

=== tier-1 seeds ===
--- domains.yaml ---
${ctx.seeds.domains}
--- schema-org-actions.yaml ---
${ctx.seeds.schemaOrgActions}
--- verbnet-classes.yaml ---
${ctx.seeds.verbnetClasses}

Return the JSON object now.`;
}

export function parseProposerResponse(text: string): ProposerBatch {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) body = fence[1]!;
  const firstBrace = body.indexOf("{");
  if (firstBrace > 0) body = body.slice(firstBrace);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new Error(`proposer response parse failed: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") throw new Error("proposer response not an object");
  const p = parsed as Record<string, unknown>;
  const reasoning = typeof p.reasoning === "string" ? p.reasoning : "";
  if (!Array.isArray(p.candidates)) throw new Error("proposer response missing candidates array");
  const candidates: Candidate[] = [];
  for (const raw of p.candidates) {
    const c = normalizeCandidate(raw);
    if (c) candidates.push(c);
  }
  return { reasoning, candidates };
}

function normalizeCandidate(raw: unknown): Candidate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  if (kind !== "component" && kind !== "behavior" && kind !== "archetype") return null;
  const name = typeof r.name === "string" ? r.name : null;
  const domain = typeof r.domain === "string" ? (r.domain as Domain) : null;
  const description = typeof r.description === "string" ? r.description : "";
  const data = r.data;
  if (!name || !domain || !data || typeof data !== "object") return null;
  return { kind, name, domain, description, data: data as never };
}

// -------------------------------------------------------------------------
// Offline candidate pool for the stub proposer. These are shaped like the real
// JSON-LD documents so validation gates exercise the same code paths.

type SeedTemplate = {
  kind: "component" | "behavior";
  name: string;
  category?: ComponentDoc["category"];
  fields?: ComponentDoc["fields"];
  required_components?: string[];
  actions?: BehaviorDoc["actions"];
  state_machine?: BehaviorDoc["state_machine"];
  description: string;
};

const CANDIDATE_POOL: Partial<Record<Domain, SeedTemplate[]>> = {
  economic: [
    {
      kind: "component",
      name: "CreditLine",
      category: "resource",
      fields: [
        { name: "limit", type: "float" },
        { name: "balance", type: "float" },
      ],
      description: "Available credit a counterparty extends.",
    },
    {
      kind: "behavior",
      name: "NegotiateLoan",
      required_components: ["ecs:FinancialState"],
      actions: [{ name: "propose" }, { name: "accept" }],
      state_machine: {
        states: ["Idle", "Proposing", "Accepted"],
        initial: "Idle",
        transitions: [
          { from: "Idle", to: "Proposing", on: "propose" },
          { from: "Proposing", to: "Accepted", on: "accept" },
        ],
      },
      description: "Request a loan from another entity with goods or money backing.",
    },
  ],
  social: [
    {
      kind: "component",
      name: "ReputationProfile",
      category: "relation",
      fields: [
        { name: "scores", type: "map<string,float>" },
        { name: "lastUpdated", type: "int" },
      ],
      description: "Per-domain reputation scores by counterparty.",
    },
    {
      kind: "behavior",
      name: "SpreadRumor",
      required_components: ["ecs:CognitiveState", "ecs:MemoryLog"],
      actions: [{ name: "overhear" }, { name: "propagate" }],
      state_machine: {
        states: ["Unknown", "Heard", "Propagated"],
        initial: "Unknown",
        transitions: [
          { from: "Unknown", to: "Heard", on: "overhear" },
          { from: "Heard", to: "Propagated", on: "propagate" },
        ],
      },
      description: "Hear a claim from a neighbor and retell it to someone else.",
    },
  ],
  cognitive: [
    {
      kind: "component",
      name: "AttentionBudget",
      category: "capability",
      fields: [
        { name: "totalSlots", type: "int" },
        { name: "allocatedSlots", type: "int" },
      ],
      description: "How much concurrent attention the entity can hold.",
    },
  ],
  governance: [
    {
      kind: "component",
      name: "GovernanceState",
      category: "state",
      fields: [
        { name: "rules", type: "string" },
        { name: "votingWeights", type: "map<string,float>" },
      ],
      description: "Governance rules and voting weight table.",
    },
    {
      kind: "behavior",
      name: "GovernViaPolicy",
      required_components: ["ecs:GovernanceState"],
      actions: [{ name: "propose_policy" }, { name: "vote" }, { name: "enforce" }],
      state_machine: {
        states: ["Idle", "Proposing", "Voting", "Executing"],
        initial: "Idle",
        transitions: [
          { from: "Idle", to: "Proposing", on: "propose_policy" },
          { from: "Proposing", to: "Voting", on: "vote" },
          { from: "Voting", to: "Executing", on: "enforce" },
        ],
      },
      description: "Propose, vote on, and enforce policy across members.",
    },
  ],
  environmental: [
    {
      kind: "component",
      name: "Resource",
      category: "resource",
      fields: [
        { name: "kind", type: "string" },
        { name: "quantity", type: "float" },
      ],
      description: "A consumable or tradable quantity at a location.",
    },
  ],
  organizational: [
    {
      kind: "component",
      name: "ProcessState",
      category: "state",
      fields: [
        { name: "activeProcesses", type: "map<string,string>" },
        { name: "completed", type: "list<string>" },
      ],
      description: "Running and completed organizational processes.",
    },
  ],
};

const STRATEGY_HINTS: Record<Strategy, string> = {
  broad_survey: "generate diverse foundational concepts — breadth over depth.",
  gap_fill: "identify missing connective concepts between existing ones.",
  specialization: "propose subtypes and edge cases refining existing concepts.",
};

function buildCandidateFromSeed(seed: SeedTemplate, name: string, domain: Domain): Candidate {
  if (seed.kind === "component") {
    return {
      kind: "component",
      name,
      domain,
      description: seed.description,
      data: {
        "@id": `ecs:${name}`,
        name,
        category: seed.category ?? "state",
        domain,
        description: seed.description,
        fields: seed.fields ?? [{ name: "value", type: "float" }],
      },
    };
  }
  return {
    kind: "behavior",
    name,
    domain,
    description: seed.description,
    data: {
      "@id": `ecs:${name}`,
      name,
      domain,
      description: seed.description,
      required_components: seed.required_components ?? [],
      reads: [],
      writes: [],
      actions: seed.actions ?? [{ name: "do" }],
      state_machine: seed.state_machine ?? {
        states: ["Idle", "Running"],
        initial: "Idle",
        transitions: [{ from: "Idle", to: "Running", on: "do" }],
      },
    },
  };
}

import type { Entity } from "../simulation/entity";
import type { World } from "../simulation/world";

export type T3EntityContext = {
  id: string;
  name: string;
  archetype: string;
  phase: string;
  values: Record<string, number>;
  resources: { money: number; goods: number; energy: number };
  situation: string;
  nearby: Array<{ id: string; name: string; archetype: string }>;
  recentMemory: Array<{ tick: number; kind: string; summary: string }>;
  /** Top-N retrieved memories from the cross-entity graph, ranked by
   *  lexical relevance to the situation + recency. Distinct from the
   *  per-entity ring buffer in `recentMemory`. */
  relevantMemories: Array<{
    tick: number;
    kind: string;
    subject: string;
    object?: string;
    summary: string;
  }>;
  validActions: Array<{
    name: string;
    description: string;
    input?: Record<string, string>;
  }>;
};

export type T3SelectedAction =
  | { kind: "move_to"; x: number; y: number; rationale?: string }
  | { kind: "speak"; target: string; msg: string; rationale?: string }
  | { kind: "trade"; target: string; goods: number; price: number; rationale?: string }
  | { kind: "rest"; rationale?: string }
  | { kind: "noop"; rationale?: string };

export type T3Response = {
  entityId: string;
  action: T3SelectedAction;
};

export type T3Client = {
  /** True when the client will attempt a real LLM call. */
  readonly live: boolean;
  selectActions(contexts: T3EntityContext[]): Promise<T3Response[]>;
};

export type T3Config = {
  model?: string;
  apiKey?: string;
  maxBatchSize?: number;
  temperature?: number;
  timeoutMs?: number;
  logger?: (msg: string) => void;
};

export function buildT3Context(
  entity: Entity,
  situation: string,
  world?: World,
): T3EntityContext {
  const p = entity.components.physical;
  const f = entity.components.financial;
  const c = entity.components.cognitive;
  const m = entity.components.memory;
  const perceived = entity.components.perceived;

  // Enrich nearby with names + archetypes from the world if available.
  const nearby =
    perceived?.nearbyIds.slice(0, 6).map((id) => {
      const other = world?.entities.get(id);
      return {
        id,
        name: other?.name ?? id,
        archetype: other?.archetype ?? "unknown",
      };
    }) ?? [];

  // QuickSearch the cross-entity graph for memories scored by recency +
  // situational keyword overlap. This is the substantive upgrade over the
  // per-entity ring buffer: an entity can now "remember" what others did to
  // each other in its vicinity.
  let relevantMemories: T3EntityContext["relevantMemories"] = [];
  if (world) {
    const hits = world.memoryGraph.search({
      entityId: entity.id,
      query: situation,
      limit: 6,
    });
    relevantMemories = hits.map((h) => ({
      tick: h.tick,
      kind: h.kind,
      subject: h.subject,
      object: h.object,
      summary: h.summary,
    }));
  }

  return {
    id: entity.id,
    name: entity.name,
    archetype: entity.archetype,
    phase: entity.state[entity.activeBehavior]?.phase ?? "Idle",
    values: c?.values ?? {},
    resources: {
      money: f?.money ?? 0,
      goods: f?.goods ?? 0,
      energy: p?.energy ?? 0,
    },
    situation,
    nearby,
    recentMemory:
      m?.recent.slice(-5).map((e) => ({
        tick: e.tick,
        kind: e.kind,
        summary: e.summary,
      })) ?? [],
    relevantMemories,
    validActions: [
      { name: "move_to", description: "Move to an (x, y) point", input: { x: "number", y: "number" } },
      { name: "speak", description: "Say a message to a nearby entity", input: { target: "entityId", msg: "string" } },
      { name: "trade", description: "Offer to trade goods for money", input: { target: "entityId", goods: "number", price: "number" } },
      { name: "rest", description: "Rest to recover energy" },
      { name: "noop", description: "Stand idle this tick" },
    ],
  };
}

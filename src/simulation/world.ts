import type { WorldEvent } from "./actions";
import type { BehaviorName, Entity, EntitySnapshot } from "./entity";
import { createGraphMemory, type GraphMemory } from "./graph-memory";
import { findRegion, type Region } from "./regions";
import type { Rng } from "./rng";
import type { ActiveScenario } from "./scenarios";

export type WorldBounds = { width: number; height: number };

export type DeliberationRecord = {
  tick: number;
  entityId: string;
  entityName: string;
  archetype: string;
  situation: string;
  retrievedMemories: Array<{ tick: number; kind: string; summary: string }>;
  actionKind: string;
  actionTarget?: string;
  actionDetail?: string;
  rationale?: string;
  latencyMs: number;
  source: "stub" | "live";
};

const DELIBERATION_CAP = 50;

export type World = {
  tick: number;
  bounds: WorldBounds;
  entities: Map<string, Entity>;
  order: string[];
  events: WorldEvent[];
  rng: Rng;
  // Transient visual state — cleared each tick by renderer-friendly helpers.
  speechBubbles: Map<string, { msg: string; expiresAtTick: number }>;
  // Cross-entity event graph. Populated automatically by emit() for any event
  // whose `source` resolves to a known entity. Used by T3 retrieval.
  memoryGraph: GraphMemory;
  // Cumulative count of ontology rule violations caught by the reasoner.
  policyViolations: number;
  // Ring buffer of recent T3 LLM deliberations (stub or live). The
  // Deliberations panel reads from here.
  deliberations: DeliberationRecord[];
  // Currently-active scenario event (banner overlay until expiresAtTick).
  activeScenario?: ActiveScenario;
  // Brief stage-wide color flash to make scenario events impossible to miss.
  broadcastFlash?: { color: number; expiresAtTick: number };
  // Region-gated simulation. When `regions` is non-empty, only entities in
  // the active region tick — others freeze. Empty array = no gating (legacy
  // behavior, used by tests and any single-region scenario).
  regions: Region[];
  activeRegionId: string | null;
};

// World events that should be folded into the long-term graph. System-level
// events (t3_batch_*, needs_deliberation) are kept in the linear event log
// only to avoid polluting per-entity recall.
const GRAPHED_EVENT_KINDS: ReadonlySet<string> = new Set([
  "speech",
  "trade",
  "tax",
]);

export function createWorld(opts: {
  bounds: WorldBounds;
  rng: Rng;
  memoryGraph?: GraphMemory;
  regions?: Region[];
}): World {
  return {
    tick: 0,
    bounds: opts.bounds,
    entities: new Map(),
    order: [],
    events: [],
    rng: opts.rng,
    speechBubbles: new Map(),
    memoryGraph: opts.memoryGraph ?? createGraphMemory(),
    policyViolations: 0,
    deliberations: [],
    regions: opts.regions ?? [],
    activeRegionId: null,
  };
}

/** Push a T3 deliberation record onto the ring buffer. */
export function recordDeliberation(world: World, record: DeliberationRecord): void {
  world.deliberations.push(record);
  if (world.deliberations.length > DELIBERATION_CAP) {
    world.deliberations.splice(0, world.deliberations.length - DELIBERATION_CAP);
  }
}

export function addEntity(world: World, entity: Entity): void {
  world.entities.set(entity.id, entity);
  world.order.push(entity.id);
}

export function getEntity(world: World, id: string): Entity | undefined {
  return world.entities.get(id);
}

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Region id at the entity's current physical position. */
export function regionIdOf(world: World, entity: Entity): string | null {
  const p = entity.components.physical;
  if (!p) return null;
  return findRegion(world.regions, p.x, p.y)?.id ?? null;
}

export function findNearby(world: World, entity: Entity, radius: number): Entity[] {
  const p = entity.components.physical;
  if (!p) return [];
  const r2 = radius * radius;
  const out: Entity[] = [];
  // Region gating is *perceiver-relative*: each entity sees only neighbours in
  // the same region they're standing in. This is symmetric for active and
  // ambient NPCs — an ambient NPC in Old Fields sees other Old Fields NPCs;
  // an active NPC in Town Square sees the player and other Town Square NPCs.
  const gating = world.regions.length > 0 && world.activeRegionId != null;
  const myRegion = gating ? regionIdOf(world, entity) : null;
  for (const other of world.entities.values()) {
    if (other.id === entity.id) continue;
    const op = other.components.physical;
    if (!op) continue;
    if (gating && regionIdOf(world, other) !== myRegion) continue;
    if (distanceSq(p.x, p.y, op.x, op.y) <= r2) out.push(other);
  }
  return out;
}

/** "active" = full T1+T2+T3, "ambient" = T2-only on ambient frames, "frozen"
 *  = skip this tick. Players are always active. With no regions defined, all
 *  NPCs are active (legacy behaviour for tests). */
export type EntityActivity = "active" | "ambient" | "frozen";

export function entityActivity(
  world: World,
  entity: Entity,
  ambientFrame: boolean,
): EntityActivity {
  if (world.regions.length === 0 || world.activeRegionId == null) return "active";
  if (entity.archetype === "Player") return "active";
  const r = regionIdOf(world, entity);
  if (r === world.activeRegionId) return "active";
  return ambientFrame ? "ambient" : "frozen";
}

export function snapshot(world: World): EntitySnapshot[] {
  const out: EntitySnapshot[] = [];
  for (const id of world.order) {
    const e = world.entities.get(id);
    if (!e) continue;
    const p = e.components.physical;
    const f = e.components.financial;
    const bubble = world.speechBubbles.get(e.id);
    out.push({
      id: e.id,
      name: e.name,
      archetype: e.archetype,
      activeBehavior: e.activeBehavior,
      phase: e.state[e.activeBehavior]?.phase ?? "Idle",
      x: p?.x ?? 0,
      y: p?.y ?? 0,
      energy: p?.energy ?? 0,
      money: f?.money ?? 0,
      goods: f?.goods ?? 0,
      savings: f?.savings ?? 0,
      speechBubble: bubble && bubble.expiresAtTick >= world.tick ? bubble.msg : null,
    });
  }
  return out;
}

export function emit(world: World, event: Omit<WorldEvent, "tick">): void {
  const full: WorldEvent = { tick: world.tick, ...event };
  world.events.push(full);
  if (world.events.length > 500) world.events.splice(0, world.events.length - 500);

  // Mirror entity-relevant events into the graph memory for T3 retrieval.
  if (GRAPHED_EVENT_KINDS.has(full.kind) && world.entities.has(full.source)) {
    world.memoryGraph.insert({
      tick: full.tick,
      kind: full.kind,
      subject: full.source,
      object: full.target,
      summary: full.summary,
    });
  }
}

export function setBehaviorPhase(
  entity: Entity,
  name: BehaviorName,
  phase: string,
  data: Record<string, number | string | null> = {},
): void {
  entity.state[name] = { name, phase, data };
}

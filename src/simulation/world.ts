import type { WorldEvent } from "./actions";
import { BIOMES } from "./biome";
import {
  DECORATION_SIZES,
  isDecorCollidable,
  nextDecorationId,
  type Decoration,
  type DecorationKind,
  type DecorationSnapshot,
} from "./decoration";
import type { BehaviorName, Entity, EntitySnapshot } from "./entity";
import { createGraphMemory, type GraphMemory } from "./graph-memory";
import { findRegion, type Region } from "./regions";
import type { ReplayRecorder } from "./replay";
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
  speechBubbles: Map<string, { msg: string; expiresAtTick: number }>;
  memoryGraph: GraphMemory;
  policyViolations: number;
  deliberations: DeliberationRecord[];
  activeScenario?: ActiveScenario;
  broadcastFlash?: { color: number; expiresAtTick: number };
  regions: Region[];
  activeRegionId: string | null;
  decorations: Decoration[];
  // Optional deterministic replay recorder. When attached, each tick is
  // snapshotted for later comparison (A/B testing, regression).
  replayRecorder?: ReplayRecorder;
};

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
    decorations: [],
  };
}

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

export function getCollisions(world: World, x: number, y: number, w: number, h: number): boolean {
  for (const dec of world.decorations) {
    if (!dec.isCollidable) continue;
    if (
      x < dec.x + dec.width &&
      x + w > dec.x &&
      y < dec.y + dec.height &&
      y + h > dec.y
    ) {
      return true;
    }
  }
  return false;
}

function pickDecorationKind(rng: Rng, treeChance: number, rockChance: number): DecorationKind {
  const roll = rng.next();
  if (roll < treeChance) return "tree";
  if (roll < treeChance + rockChance) return "rock";
  return "signpost";
}

function makeDecoration(
  kind: DecorationKind,
  x: number,
  y: number,
  variant: number,
  animPhase: number,
): Decoration {
  const size = DECORATION_SIZES[kind];
  return {
    id: nextDecorationId(),
    kind,
    x: x - size.width / 2,
    y: y - size.height / 2,
    width: size.width,
    height: size.height,
    variant,
    isCollidable: isDecorCollidable(kind),
    animPhase,
  };
}

export function spawnDecorations(world: World, regions: readonly Region[]): void {
  const placed = new Set<string>();

  for (const region of regions) {
    const biome = BIOMES[region.biome];
    const bounds = region.bounds;
    const area = bounds.w * bounds.h;
    const decoCount = Math.max(8, Math.floor((area / 10_000) * biome.decorationDensity));
    const cellArea = area / decoCount;
    const cellSize = Math.max(16, Math.sqrt(cellArea));
    const cols = Math.max(1, Math.floor(bounds.w / cellSize));
    const rows = Math.max(1, Math.floor(bounds.h / cellSize));
    const cellW = bounds.w / cols;
    const cellH = bounds.h / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = bounds.x + c * cellW;
        const cy = bounds.y + r * cellH;
        const jitterX = world.rng.range(cellW * 0.1, cellW * 0.9);
        const jitterY = world.rng.range(cellH * 0.1, cellH * 0.9);
        const px = Math.round(cx + jitterX);
        const py = Math.round(cy + jitterY);

        const key = `${px},${py}`;
        if (placed.has(key)) continue;
        placed.add(key);

        let kind: DecorationKind = "tree";
        const ambientRoll = biome.ambientObjects.length > 0 ? world.rng.next() : 1;
        let ambientPicked = false;
        for (const amb of biome.ambientObjects) {
          if (ambientRoll < amb.chance) {
            kind = amb.kind;
            ambientPicked = true;
            break;
          }
        }

        if (!ambientPicked) {
          kind = pickDecorationKind(world.rng, biome.treeChance, biome.rockChance);
        }

        const variant = world.rng.int(0, 3);
        const animPhase = world.rng.next();
        world.decorations.push(makeDecoration(kind, px, py, variant, animPhase));
      }
    }

    const gridStep = 200;
    for (let bx = bounds.x; bx < bounds.x + bounds.w; bx += gridStep) {
      for (let by = bounds.y; by < bounds.y + bounds.h; by += gridStep) {
        if (world.rng.chance(biome.buildingChance)) {
          const px = Math.round(bx + world.rng.range(24, gridStep - 24));
          const py = Math.round(by + world.rng.range(24, gridStep - 24));
          const variant = world.rng.int(0, 3);
          world.decorations.push(makeDecoration("building", px, py, variant, 0));
        }
      }
    }
  }

  const boundaryInterval = 120;
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i]?.bounds;
      const b = regions[j]?.bounds;
      if (!a || !b) continue;

      const ax2 = a.x + a.w;
      const ay2 = a.y + a.h;
      const bx2 = b.x + b.w;
      const by2 = b.y + b.h;

      const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));

      const sharesVertical =
        overlapY > 10 &&
        (Math.abs(ax2 - b.x) < 2 || Math.abs(bx2 - a.x) < 2);
      const sharesHorizontal =
        overlapX > 10 &&
        (Math.abs(ay2 - b.y) < 2 || Math.abs(by2 - a.y) < 2);

      if (!sharesVertical && !sharesHorizontal) continue;

      if (sharesVertical) {
        const edgeX = Math.abs(ax2 - b.x) < 2 ? ax2 : bx2;
        const edgeY0 = Math.max(a.y, b.y);
        const edgeY1 = Math.min(ay2, by2);
        for (let py = edgeY0 + 30; py < edgeY1 - 30; py += boundaryInterval) {
          const variant = world.rng.int(0, 3);
          const animPhase = world.rng.next();
          world.decorations.push(
            makeDecoration("signpost", edgeX, Math.round(py), variant, animPhase),
          );
        }
      }

      if (sharesHorizontal) {
        const edgeY = Math.abs(ay2 - b.y) < 2 ? ay2 : by2;
        const edgeX0 = Math.max(a.x, b.x);
        const edgeX1 = Math.min(ax2, bx2);
        for (let px = edgeX0 + 30; px < edgeX1 - 30; px += boundaryInterval) {
          const variant = world.rng.int(0, 3);
          const animPhase = world.rng.next();
          world.decorations.push(
            makeDecoration("signpost", Math.round(px), edgeY, variant, animPhase),
          );
        }
      }
    }
  }
}

export function getDecorationsSnapshot(world: World): DecorationSnapshot[] {
  return world.decorations.map((d) => ({
    id: d.id,
    kind: d.kind,
    variant: d.variant,
    x: d.x,
    y: d.y,
    width: d.width,
    height: d.height,
    isCollidable: d.isCollidable,
    animPhase: d.animPhase,
  }));
}

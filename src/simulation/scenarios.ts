// Periodic scenario events. Every SCENARIO_INTERVAL ticks one of these fires
// and mutates entity state in a way that's hard for the deterministic T2
// scoring to handle elegantly — the goal is to push borderline cases into T3
// LLM deliberation so the AI layer is *visible* in the simulation.
//
// Each scenario:
//   - emits a world event with kind "scenario:<name>" (auto-graph-mirrored)
//   - mutates entity components
//   - sets `world.activeScenario` so the renderer can draw a banner
//
// Add new scenarios by appending to SCENARIOS — the picker rolls uniformly.

import { emit, type World } from "./world";

export const SCENARIO_INTERVAL = 200;
const ACTIVE_LINGER_TICKS = 25;

export type ScenarioName = "market_crash" | "riot" | "festival" | "plague";

export type ActiveScenario = {
  name: ScenarioName;
  startedAtTick: number;
  expiresAtTick: number;
  epicenter?: { x: number; y: number };
  message: string;
};

type Scenario = {
  name: ScenarioName;
  message: (world: World) => string;
  apply: (world: World) => Partial<ActiveScenario> | void;
};

const SCENARIOS: Scenario[] = [
  {
    name: "market_crash",
    message: () => "Market crash — money halved, prices unstable",
    apply(world) {
      let touched = 0;
      for (const e of world.entities.values()) {
        const f = e.components.financial;
        if (!f) continue;
        const before = f.money;
        f.money = Math.floor(f.money * 0.5);
        if (f.money < before) touched += 1;
      }
      // Knock everyone's working memory load up — they'll notice.
      for (const e of world.entities.values()) {
        const c = e.components.cognitive;
        if (c) c.workingMemoryLoad = Math.min(1, c.workingMemoryLoad + 0.5);
      }
      world.broadcastFlash = { color: 0xfbbf24, expiresAtTick: world.tick + 8 };
      emit(world, {
        kind: "scenario:market_crash",
        source: "scenario",
        summary: `cash halved across ${touched} entities`,
      });
    },
  },
  {
    name: "riot",
    message: () => "Riot — civilians scatter from the epicenter",
    apply(world) {
      const cx = world.rng.range(120, world.bounds.width - 120);
      const cy = world.rng.range(120, world.bounds.height - 120);
      const radius2 = 220 * 220;
      let scattered = 0;
      for (const e of world.entities.values()) {
        const p = e.components.physical;
        if (!p) continue;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > radius2) continue;
        // Push outward by 80–180 px.
        const dist = Math.sqrt(dist2) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const flee = 80 + world.rng.range(0, 100);
        p.destX = clamp(p.x + nx * flee, 20, world.bounds.width - 20);
        p.destY = clamp(p.y + ny * flee, 20, world.bounds.height - 20);
        p.energy = Math.max(0, p.energy - 0.1);
        scattered += 1;
      }
      world.broadcastFlash = { color: 0xf87171, expiresAtTick: world.tick + 8 };
      emit(world, {
        kind: "scenario:riot",
        source: "scenario",
        summary: `riot at (${Math.round(cx)}, ${Math.round(cy)}); ${scattered} fled`,
      });
      return { epicenter: { x: cx, y: cy } };
    },
  },
  {
    name: "festival",
    message: () => "Festival — entities drawn together, community boosted",
    apply(world) {
      const cx = world.rng.range(200, world.bounds.width - 200);
      const cy = world.rng.range(200, world.bounds.height - 200);
      let drawn = 0;
      for (const e of world.entities.values()) {
        const p = e.components.physical;
        if (!p) continue;
        // 60% chance the entity heads to the festival.
        if (!world.rng.chance(0.6)) continue;
        const tx = cx + world.rng.range(-100, 100);
        const ty = cy + world.rng.range(-80, 80);
        p.destX = clamp(tx, 20, world.bounds.width - 20);
        p.destY = clamp(ty, 20, world.bounds.height - 20);
        drawn += 1;
        const c = e.components.cognitive;
        if (c) c.values.community = Math.min(1, c.values.community + 0.1);
      }
      world.broadcastFlash = { color: 0x34d399, expiresAtTick: world.tick + 8 };
      emit(world, {
        kind: "scenario:festival",
        source: "scenario",
        summary: `festival at (${Math.round(cx)}, ${Math.round(cy)}); ${drawn} attending`,
      });
      return { epicenter: { x: cx, y: cy } };
    },
  },
  {
    name: "plague",
    message: () => "Plague — energy drained across the village",
    apply(world) {
      let infected = 0;
      for (const e of world.entities.values()) {
        const p = e.components.physical;
        if (!p) continue;
        if (world.rng.chance(0.7)) {
          p.energy = Math.max(0, p.energy - 0.35);
          infected += 1;
        }
      }
      world.broadcastFlash = { color: 0xa855f7, expiresAtTick: world.tick + 8 };
      emit(world, {
        kind: "scenario:plague",
        source: "scenario",
        summary: `plague: ${infected} entities weakened`,
      });
    },
  },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Fires once per tick if the cadence aligns. Returns the chosen scenario name. */
export function maybeRunScenario(world: World): ActiveScenario | null {
  // Skip the first window so the simulation has time to settle.
  if (world.tick < SCENARIO_INTERVAL) return null;
  if (world.tick % SCENARIO_INTERVAL !== 0) return null;

  const pick = SCENARIOS[world.rng.int(0, SCENARIOS.length - 1)]!;
  const partial = pick.apply(world) ?? {};
  const active: ActiveScenario = {
    name: pick.name,
    startedAtTick: world.tick,
    expiresAtTick: world.tick + ACTIVE_LINGER_TICKS,
    message: pick.message(world),
    ...partial,
  };
  world.activeScenario = active;
  return active;
}

/** Clear the active scenario once its banner has lingered long enough. */
export function expireActiveScenario(world: World): void {
  if (world.activeScenario && world.activeScenario.expiresAtTick < world.tick) {
    world.activeScenario = undefined;
  }
}

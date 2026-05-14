// (#58) Schedule: day-phase driven movement. Different archetypes have
// different daily routines. Score spikes when the entity is in the wrong
// region for the current phase; decide steers them toward the right one.

import { setBehaviorPhase } from "../simulation/world";
import { findRegion } from "../simulation/regions";
import type { BehaviorModule } from "./behavior";
import type { Archetype } from "../simulation/entity";

/** Day phases: morning, noon, evening, night. Each is a 25% slice of
 *  DAY_CYCLE_TICKS. Player-facing day/night badge uses the same constant. */
export const DAY_CYCLE_TICKS = 240;

type Phase = "morning" | "noon" | "evening" | "night";

function currentPhase(tick: number): Phase {
  const p = (tick % DAY_CYCLE_TICKS) / DAY_CYCLE_TICKS;
  if (p < 0.25) return "morning";
  if (p < 0.5) return "noon";
  if (p < 0.75) return "evening";
  return "night";
}

/** Where each archetype "should" be in each phase. Region ids match the
 *  small-village scenario. Unset = no preference. */
const ARCHETYPE_SCHEDULE: Record<Archetype, Partial<Record<Phase, string>>> = {
  Person: {
    morning: "town-square",
    noon: "market-row",
    evening: "town-square",
    night: "town-square",
  },
  Merchant: {
    morning: "market-row",
    noon: "market-row",
    evening: "market-row",
    night: "town-square",
  },
  Wanderer: {
    morning: "wilds",
    noon: "driftwood-coast",
    evening: "wilds",
    night: "town-square",
  },
  MarketMaker: {
    morning: "market-row",
    noon: "market-row",
    evening: "market-row",
    night: "town-square",
  },
  Lawkeeper: {
    morning: "garrison",
    noon: "town-square",
    evening: "market-row",
    night: "garrison",
  },
  Player: {},
};

export const Schedule: BehaviorModule = {
  name: "Schedule",
  score(entity, world) {
    const p = entity.components.physical;
    if (!p) return 0;
    const target = ARCHETYPE_SCHEDULE[entity.archetype]?.[currentPhase(world.tick)];
    if (!target) return 0;
    const here = findRegion(world.regions, p.x, p.y)?.id;
    // High score when out-of-region; low when already in place.
    return here === target ? 0.05 : 0.55;
  },
  decide(entity, world) {
    const p = entity.components.physical;
    if (!p) return { kind: "noop", entityId: entity.id, reason: "no physical state" };
    const targetId = ARCHETYPE_SCHEDULE[entity.archetype]?.[currentPhase(world.tick)];
    if (!targetId) {
      return { kind: "noop", entityId: entity.id, reason: "no scheduled region" };
    }
    const targetRegion = world.regions.find((r) => r.id === targetId);
    if (!targetRegion) {
      return { kind: "noop", entityId: entity.id, reason: "scheduled region missing" };
    }

    const here = findRegion(world.regions, p.x, p.y)?.id;
    if (here === targetId) {
      // Already in place — settle, free for other behaviors next tick.
      setBehaviorPhase(entity, "Schedule", "Arrived");
      return { kind: "noop", entityId: entity.id, reason: "arrived at schedule" };
    }

    // Pick a random spot inside the target region.
    const b = targetRegion.bounds;
    const destX = b.x + world.rng.range(20, Math.max(20, b.w - 20));
    const destY = b.y + world.rng.range(20, Math.max(20, b.h - 20));
    p.destX = destX;
    p.destY = destY;
    setBehaviorPhase(entity, "Schedule", "Commuting", { destX, destY });
    return { kind: "move_to", entityId: entity.id, x: destX, y: destY };
  },
};

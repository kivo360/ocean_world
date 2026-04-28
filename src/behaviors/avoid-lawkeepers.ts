import { getEntity, setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

// AvoidLawkeepers: Fleeing
// NPCs with low fairness flee from lawkeepers within perception radius.
export const AvoidLawkeepers: BehaviorModule = {
  name: "AvoidLawkeepers",
  score(entity, _world) {
    const cog = entity.components.cognitive;
    if (!cog) return 0;
    // Only relevant for NPCs with low fairness.
    if (cog.values.fairness >= 0.4) return 0;
    const perceived = entity.components.perceived;
    if (!perceived) return 0;
    // Check if any lawkeeper is nearby.
    return 0.4 + 0.5 * Math.max(0, 0.4 - cog.values.fairness) / 0.4;
  },
  decide(entity, world) {
    const p = entity.components.physical;
    if (!p) return { kind: "noop", entityId: entity.id, reason: "no physical state" };

    const perceived = entity.components.perceived;
    if (!perceived) return { kind: "noop", entityId: entity.id, reason: "no perceived state" };

    // Find nearest lawkeeper in range.
    let nearestLawkeeperId: string | null = null;
    let nearestDist2 = Infinity;
    for (const id of perceived.nearbyIds) {
      const other = getEntity(world, id);
      if (!other || other.archetype !== "Lawkeeper") continue;
      const op = other.components.physical;
      if (!op) continue;
      const dx = op.x - p.x;
      const dy = op.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestDist2) {
        nearestDist2 = d2;
        nearestLawkeeperId = id;
      }
    }

    if (!nearestLawkeeperId) {
      return { kind: "noop", entityId: entity.id, reason: "no lawkeeper nearby" };
    }

    const lawkeeper = getEntity(world, nearestLawkeeperId);
    if (!lawkeeper) {
      return { kind: "noop", entityId: entity.id, reason: "lawkeeper not found" };
    }
    const lp = lawkeeper.components.physical;
    if (!lp) {
      return { kind: "noop", entityId: entity.id, reason: "lawkeeper has no physical state" };
    }

    // Flee in opposite direction from nearest lawkeeper.
    const dx = p.x - lp.x;
    const dy = p.y - lp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) {
      return { kind: "noop", entityId: entity.id, reason: "too close to lawkeeper" };
    }

    const fleeX = p.x + (dx / dist) * 60;
    const fleeY = p.y + (dy / dist) * 60;
    const clampedX = Math.max(10, Math.min(world.bounds.width - 10, fleeX));
    const clampedY = Math.max(10, Math.min(world.bounds.height - 10, fleeY));

    p.destX = clampedX;
    p.destY = clampedY;
    setBehaviorPhase(entity, "AvoidLawkeepers", "Fleeing", {
      lawkeeperId: nearestLawkeeperId,
    });
    return { kind: "move_to", entityId: entity.id, x: clampedX, y: clampedY };
  },
};

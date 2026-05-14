import { getEntity, setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

// PursueViolators: Idle → Pursuing → Caught → Idle
// Lawkeepers chase entities with low fairness within perception range.
export const PursueViolators: BehaviorModule = {
  name: "PursueViolators",
  score(entity, _world) {
    // Only lawkeepers pursue violators.
    if (entity.archetype !== "Lawkeeper") return 0;
    const perceived = entity.components.perceived;
    if (!perceived) return 0;
    // Check if any entity with low fairness is in range.
    for (const id of perceived.nearbyIds) {
      const other = _world.entities.get(id);
      if (!other) continue;
      const oc = other.components.cognitive;
      if (!oc) continue;
      if (oc.values.fairness < 0.3) {
        return 0.5 + 0.4 * Math.max(0, 0.3 - oc.values.fairness) / 0.3;
      }
    }
    return 0;
  },
  decide(entity, world) {
    const p = entity.components.physical;
    if (!p) return { kind: "noop", entityId: entity.id, reason: "no physical state" };

    const phase = entity.state.PursueViolators?.phase ?? "Idle";

    // If in Idle or Caught phase, look for a violator.
    if (phase === "Idle" || phase === "Caught") {
      const target = findNearestViolator(entity, world);
      if (!target) {
        return { kind: "noop", entityId: entity.id, reason: "no violator in range" };
      }
      const tp = target.components.physical;
      if (!tp) {
        return { kind: "noop", entityId: entity.id, reason: "target has no physical state" };
      }
      p.destX = tp.x;
      p.destY = tp.y;
      setBehaviorPhase(entity, "PursueViolators", "Pursuing", { targetId: target.id });
      return { kind: "move_to", entityId: entity.id, x: tp.x, y: tp.y };
    }

    // Pursuing — check if still in range and track target.
    const targetId = entity.state.PursueViolators?.data.targetId as string | null | undefined;
    if (!targetId) {
      setBehaviorPhase(entity, "PursueViolators", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "lost target" };
    }

    const target = getEntity(world, targetId);
    if (!target) {
      setBehaviorPhase(entity, "PursueViolators", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "target gone" };
    }

    const tp = target.components.physical;
    if (!tp) {
      setBehaviorPhase(entity, "PursueViolators", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "target has no physical state" };
    }

    // Check if we've caught them.
    const dx = tp.x - p.x;
    const dy = tp.y - p.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < 16) {
      setBehaviorPhase(entity, "PursueViolators", "Caught", { targetId });
      return { kind: "noop", entityId: entity.id, reason: "violator caught" };
    }

    // Continue pursuit.
    p.destX = tp.x;
    p.destY = tp.y;
    return { kind: "move_to", entityId: entity.id, x: tp.x, y: tp.y };
  },
};

function findNearestViolator(
  entity: import("../simulation/entity").Entity,
  world: import("../simulation/world").World,
): import("../simulation/entity").Entity | null {
  const p = entity.components.physical;
  const perceived = entity.components.perceived;
  if (!p || !perceived) return null;

  let best: import("../simulation/entity").Entity | null = null;
  let bestDist2 = Infinity;

  for (const id of perceived.nearbyIds) {
    const other = world.entities.get(id);
    if (!other) continue;
    const oc = other.components.cognitive;
    if (!oc) continue;
    if (oc.values.fairness >= 0.3) continue;
    const op = other.components.physical;
    if (!op) continue;
    const dx = op.x - p.x;
    const dy = op.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist2) {
      bestDist2 = d2;
      best = other;
    }
  }
  return best;
}

import { setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

export const GroupUp: BehaviorModule = {
  name: "GroupUp",
  score(entity, _world) {
    const p = entity.components.physical;
    if (!p) return 0;
    // Higher score when energy is low.
    if (p.energy >= 0.4) return 0;
    // Check if any nearby entities exist to group with.
    const perceived = entity.components.perceived;
    if (!perceived || perceived.nearbyIds.length === 0) return 0;
    return 0.3 + 0.5 * Math.max(0, 1 - p.energy / 0.4);
  },
  decide(entity, world) {
    const p = entity.components.physical;
    if (!p) return { kind: "noop", entityId: entity.id, reason: "no physical state" };

    const perceived = entity.components.perceived;
    if (!perceived || perceived.nearbyIds.length === 0) {
      return { kind: "noop", entityId: entity.id, reason: "no nearby entities" };
    }

    const current = entity.state.GroupUp;
    const phase = current?.phase ?? "Idle";

    // Calculate group centroid of nearby entities
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const id of perceived.nearbyIds) {
      const other = world.entities.get(id);
      if (!other) continue;
      const op = other.components.physical;
      if (!op) continue;
      sumX += op.x;
      sumY += op.y;
      count++;
    }

    if (count === 0) {
      return { kind: "noop", entityId: entity.id, reason: "no valid targets" };
    }

    const centroidX = sumX / count;
    const centroidY = sumY / count;

    // Check if already close to centroid
    const dx = centroidX - p.x;
    const dy = centroidY - p.y;
    const dist2 = dx * dx + dy * dy;

    if (phase === "Idle" || dist2 >= 400) {
      // Move toward group
      p.destX = centroidX;
      p.destY = centroidY;
      setBehaviorPhase(entity, "GroupUp", "MovingToGroup", {
        targetCount: count,
        centroidX,
        centroidY,
      });
      return { kind: "move_to", entityId: entity.id, x: centroidX, y: centroidY };
    }

    // Close enough — arrived
    p.destX = null;
    p.destY = null;
    setBehaviorPhase(entity, "GroupUp", "Arrived");
    return { kind: "noop", entityId: entity.id, reason: "arrived at group" };
  },
};

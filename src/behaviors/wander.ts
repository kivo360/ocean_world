import { setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

// Wander: Idle → Moving → Arrived
// Picks a random destination, emits move_to actions until arrival.
export const Wander: BehaviorModule = {
  name: "Wander",
  score(entity, _world) {
    const p = entity.components.physical;
    if (!p) return 0;
    // Slight preference to wander when energy is mid-range.
    const energyFit = 1 - Math.abs(p.energy - 0.7);
    return 0.25 + 0.4 * Math.max(0, energyFit);
  },
  decide(entity, world) {
    const p = entity.components.physical;
    if (!p) return { kind: "noop", entityId: entity.id, reason: "no physical state" };

    const current = entity.state.Wander;
    const phase = current?.phase ?? "Idle";

    if (phase === "Idle" || phase === "Arrived" || p.destX === null || p.destY === null) {
      // (#48) Befriend: pick destinations near the befriender if any, so the
      // NPC orbits the player. Falls back to random when out of sight.
      let destX: number;
      let destY: number;
      if (entity.befriendedBy) {
        const friend = world.entities.get(entity.befriendedBy);
        const fp = friend?.components.physical;
        if (fp) {
          const ox = world.rng.range(-40, 40);
          const oy = world.rng.range(-40, 40);
          destX = Math.max(30, Math.min(world.bounds.width - 30, fp.x + ox));
          destY = Math.max(30, Math.min(world.bounds.height - 30, fp.y + oy));
        } else {
          destX = world.rng.range(30, world.bounds.width - 30);
          destY = world.rng.range(30, world.bounds.height - 30);
        }
      } else {
        destX = world.rng.range(30, world.bounds.width - 30);
        destY = world.rng.range(30, world.bounds.height - 30);
      }
      p.destX = destX;
      p.destY = destY;
      setBehaviorPhase(entity, "Wander", "Moving", { destX, destY });
      return { kind: "move_to", entityId: entity.id, x: destX, y: destY };
    }

    const dx = p.destX - p.x;
    const dy = p.destY - p.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < 4) {
      p.destX = null;
      p.destY = null;
      setBehaviorPhase(entity, "Wander", "Arrived");
      return { kind: "noop", entityId: entity.id, reason: "arrived" };
    }
    return { kind: "move_to", entityId: entity.id, x: p.destX, y: p.destY };
  },
};

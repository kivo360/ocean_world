import { setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

// Rest: Active → Resting → Recovered
// Critical survival behavior — scored without value-weighting per docs/03.
export const Rest: BehaviorModule = {
  name: "Rest",
  score(entity, _world) {
    const p = entity.components.physical;
    if (!p) return 0;
    if (p.energy < 0.2) return 0.95;
    if (p.energy < 0.4) return 0.6;
    return 0.1;
  },
  decide(entity, _world) {
    const p = entity.components.physical;
    if (!p) return { kind: "noop", entityId: entity.id, reason: "no physical state" };

    const phase = entity.state.Rest?.phase ?? "Active";
    if (p.energy > 0.85) {
      setBehaviorPhase(entity, "Rest", "Recovered");
      return { kind: "noop", entityId: entity.id, reason: "recovered" };
    }
    if (phase !== "Resting") {
      setBehaviorPhase(entity, "Rest", "Resting");
    }
    return { kind: "rest", entityId: entity.id };
  },
};

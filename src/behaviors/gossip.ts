import { setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

export function decay(text: string, rng: { next: () => number }): string {
  const words = text.split(/\s+/);
  if (words.length === 0) return text;
  const idx = Math.floor(rng.next() * words.length);
  words[idx] = "[?]";
  return words.join(" ");
}

export const Gossip: BehaviorModule = {
  name: "Gossip",
  score(entity, _world) {
    const memory = entity.components.memory;
    const cog = entity.components.cognitive;
    if (!memory || !cog) return 0;
    const heard = memory.recent.filter((m) => m.kind === "heard");
    if (heard.length === 0) return 0;
    const communityBoost = 0.1 + 0.3 * cog.values.community;
    return 0.15 + communityBoost;
  },
  decide(entity, world) {
    const perceived = entity.components.perceived;
    const memory = entity.components.memory;
    if (!perceived || perceived.nearbyIds.length === 0) {
      setBehaviorPhase(entity, "Gossip", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "no one nearby" };
    }
    if (!memory) {
      setBehaviorPhase(entity, "Gossip", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "no memory" };
    }

    const heard = memory.recent.filter((m) => m.kind === "heard");
    if (heard.length === 0) {
      setBehaviorPhase(entity, "Gossip", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "nothing to gossip" };
    }

    if (!world.rng.chance(0.25)) {
      setBehaviorPhase(entity, "Gossip", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "decided not to gossip" };
    }

    const targetId = world.rng.pick(perceived.nearbyIds);
    const event = world.rng.pick(heard);
    const msg = decay(event.summary, world.rng);

    setBehaviorPhase(entity, "Gossip", "Speaking", { target: targetId });
    return { kind: "speak", entityId: entity.id, target: targetId, msg };
  },
};

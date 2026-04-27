import { setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

const GREETINGS = [
  "hello",
  "good day",
  "nice weather",
  "trade with me?",
  "seen anything interesting?",
  "where are you from?",
  "heard any news?",
];

const REPLIES = [
  "likewise",
  "indeed",
  "not much",
  "maybe later",
  "i'll think on it",
  "same to you",
  "perhaps",
];

// Converse: Idle → Speaking → Listening
// Two-phase interactions per docs/03: A speaks, B perceives next tick, responds tick after.
export const Converse: BehaviorModule = {
  name: "Converse",
  score(entity, _world) {
    const perceived = entity.components.perceived;
    const cog = entity.components.cognitive;
    if (!perceived || !cog) return 0;
    // Higher score if someone spoke to us, or we have nearby company.
    const incoming = perceived.incomingSpeech.length > 0 ? 0.8 : 0;
    const company = Math.min(0.3, perceived.nearbyIds.length * 0.1);
    return Math.max(incoming, 0.15 + company);
  },
  decide(entity, world) {
    const perceived = entity.components.perceived;
    if (!perceived) return { kind: "noop", entityId: entity.id, reason: "no perception" };

    // Respond to incoming speech.
    const incoming = perceived.incomingSpeech[0];
    if (incoming) {
      setBehaviorPhase(entity, "Converse", "Listening", { from: incoming.from });
      const msg = world.rng.pick(REPLIES);
      return { kind: "speak", entityId: entity.id, target: incoming.from, msg };
    }

    // Initiate with a nearby entity if any.
    if (perceived.nearbyIds.length > 0) {
      const targetId = world.rng.pick(perceived.nearbyIds);
      setBehaviorPhase(entity, "Converse", "Speaking", { target: targetId });
      const msg = world.rng.pick(GREETINGS);
      return { kind: "speak", entityId: entity.id, target: targetId, msg };
    }

    setBehaviorPhase(entity, "Converse", "Idle");
    return { kind: "noop", entityId: entity.id, reason: "no one nearby" };
  },
};

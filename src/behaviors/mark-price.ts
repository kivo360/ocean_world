import { getEntity, setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

// MarkPrice: Idle → Quoting → Cooldown → Idle
// MarketMaker-only behavior. Computes a fair price from local supply + own
// profit value, broadcasts it as a speech bubble. Visible in the world via the
// speech-bubble layer; tracks count in MemoryLog for the inspector to surface.
export const MarkPrice: BehaviorModule = {
  name: "MarkPrice",
  score(entity, world) {
    const fin = entity.components.financial;
    const cog = entity.components.cognitive;
    const perceived = entity.components.perceived;
    if (!fin || !cog || !perceived) return 0;

    // Need goods to quote against.
    if (fin.goods <= 0) return 0;

    // Cool-down — don't keep yelling. Phase Cooldown gates score down.
    const phase = entity.state.MarkPrice?.phase ?? "Idle";
    if (phase === "Cooldown") {
      const since = (entity.state.MarkPrice?.data.cooldownUntilTick as number | null) ?? 0;
      if (world.tick < since) return 0.05;
    }

    // Anyone nearby with money to hear the quote?
    let demand = 0;
    for (const id of perceived.nearbyIds) {
      const other = getEntity(world, id);
      const f = other?.components.financial;
      if (f && f.money >= 5) demand += 1;
    }
    if (demand === 0) return 0.1;

    // Profit-driven: high-profit market makers love quoting.
    return 0.55 + 0.4 * cog.values.profit;
  },
  decide(entity, world) {
    const fin = entity.components.financial;
    const cog = entity.components.cognitive;
    const perceived = entity.components.perceived;
    if (!fin || !cog || !perceived) {
      return { kind: "noop", entityId: entity.id, reason: "missing components" };
    }

    const phase = entity.state.MarkPrice?.phase ?? "Idle";

    // Pick the closest entity with money as the quote target.
    let target: string | null = null;
    let bestMoney = 0;
    for (const id of perceived.nearbyIds) {
      const other = getEntity(world, id);
      const f = other?.components.financial;
      if (f && f.money > bestMoney) {
        target = id;
        bestMoney = f.money;
      }
    }

    if (!target) {
      setBehaviorPhase(entity, "MarkPrice", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "no audience" };
    }

    // Compute price: scarce-goods + high-profit value pushes price up.
    // Cap to a sensible range so trade behavior can match against it.
    const scarcity = Math.max(0, 1 - fin.goods / 25);
    const aggression = cog.values.profit;
    const price = Math.round(5 + 4 * scarcity + 6 * aggression);
    const msg = `quote: ${price}/unit`;

    if (phase === "Idle" || phase === "Cooldown") {
      setBehaviorPhase(entity, "MarkPrice", "Quoting", { price, target });
      return { kind: "speak", entityId: entity.id, target, msg };
    }

    // Quoting → Cooldown for a few ticks.
    setBehaviorPhase(entity, "MarkPrice", "Cooldown", {
      price,
      cooldownUntilTick: world.tick + 6,
    });
    return { kind: "noop", entityId: entity.id, reason: "quote cooldown" };
  },
};

import type { Entity } from "../simulation/entity";
import { getEntity, setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

// Trade: Idle → Offering → Negotiating → Settling
// Simplified for D2 — an entity with goods offers; counterparty either accepts next tick or ignores.
export const Trade: BehaviorModule = {
  name: "Trade",
  score(entity, world) {
    const fin = entity.components.financial;
    const perceived = entity.components.perceived;
    if (!fin || !perceived) return 0;

    // Incoming offer pending: strong pull to negotiate.
    if (perceived.tradeOffers.length > 0) return 0.9;

    // Must have goods to sell and someone nearby to sell to.
    if (fin.goods <= 0) return 0;
    if (perceived.nearbyIds.length === 0) return 0;

    // Has a nearby entity with money? Simple heuristic check.
    for (const id of perceived.nearbyIds) {
      const other = getEntity(world, id);
      const f = other?.components.financial;
      if (f && f.money >= 10) {
        // Prefer trading with merchants (they perceive with larger radius too).
        return other!.archetype === "Merchant" ? 0.75 : 0.5;
      }
    }
    return 0;
  },
  decide(entity, world) {
    const fin = entity.components.financial;
    const perceived = entity.components.perceived;
    if (!fin || !perceived)
      return { kind: "noop", entityId: entity.id, reason: "missing components" };

    // Handle pending incoming offer first: accept it as a trade action.
    const offer = perceived.tradeOffers[0];
    if (offer) {
      if (fin.money >= offer.price) {
        setBehaviorPhase(entity, "Trade", "Settling", { from: offer.from });
        return {
          kind: "trade",
          entityId: entity.id,
          target: offer.from,
          goods: offer.goods,
          price: offer.price,
        };
      }
      setBehaviorPhase(entity, "Trade", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "cannot afford" };
    }

    // Find a nearby buyer with money.
    let best: Entity | undefined;
    let bestMoney = 0;
    for (const id of perceived.nearbyIds) {
      const other = getEntity(world, id);
      const f = other?.components.financial;
      if (f && f.money > bestMoney) {
        best = other!;
        bestMoney = f.money;
      }
    }
    if (!best || fin.goods <= 0) {
      setBehaviorPhase(entity, "Trade", "Idle");
      return { kind: "noop", entityId: entity.id, reason: "no buyer or no goods" };
    }

    // Make an offer: 1 good, price scaled by fairness value.
    const fairness = entity.components.cognitive?.values.fairness ?? 0.5;
    const price = Math.round(6 + (1 - fairness) * 8);
    setBehaviorPhase(entity, "Trade", "Offering", { target: best.id, price });
    return {
      kind: "trade",
      entityId: entity.id,
      target: best.id,
      goods: 1,
      price,
    };
  },
};

import { getEntity, setBehaviorPhase } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

// MerchantCoordination: Idle → Coordinating → Trading → Idle
// Merchants cluster near MarketMaker entities when not already trading.
export const MerchantCoordination: BehaviorModule = {
  name: "MerchantCoordination",
  score(entity, _world) {
    // Only merchants coordinate.
    if (entity.archetype !== "Merchant") return 0;
    const p = entity.components.physical;
    if (!p) return 0;
    // Check if a MarketMaker is nearby.
    const perceived = entity.components.perceived;
    if (!perceived) return 0;
    // Higher score when near a MarketMaker but not already in Trading phase.
    const phase = entity.state.MerchantCoordination?.phase ?? "Idle";
    if (phase === "Trading") return 0; // already trading, let it play out
    for (const id of perceived.nearbyIds) {
      const other = _world.entities.get(id);
      if (other?.archetype === "MarketMaker") {
        return 0.4 + 0.4 * (other.components.financial?.goods ?? 0) / 30;
      }
    }
    return 0;
  },
  decide(entity, world) {
    const p = entity.components.physical;
    if (!p) return { kind: "noop", entityId: entity.id, reason: "no physical state" };

    const perceived = entity.components.perceived;
    if (!perceived) {
      return { kind: "noop", entityId: entity.id, reason: "no perceived state" };
    }

    // Find nearest MarketMaker
    let nearestMmId: string | null = null;
    let nearestDist2 = Infinity;
    for (const id of perceived.nearbyIds) {
      const other = getEntity(world, id);
      if (!other || other.archetype !== "MarketMaker") continue;
      const op = other.components.physical;
      if (!op) continue;
      const dx = op.x - p.x;
      const dy = op.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestDist2) {
        nearestDist2 = d2;
        nearestMmId = id;
      }
    }

    if (!nearestMmId) {
      return { kind: "noop", entityId: entity.id, reason: "no marketmaker nearby" };
    }

    const marketmaker = getEntity(world, nearestMmId);
    if (!marketmaker) {
      return { kind: "noop", entityId: entity.id, reason: "marketmaker not found" };
    }
    const mp = marketmaker.components.physical;
    if (!mp) {
      return { kind: "noop", entityId: entity.id, reason: "marketmaker has no physical state" };
    }

    const dx = mp.x - p.x;
    const dy = mp.y - p.y;
    const dist2 = dx * dx + dy * dy;

    // Already close enough to the MarketMaker — trade.
    if (dist2 < 400) {
      const phase = entity.state.MerchantCoordination?.phase ?? "Idle";
      if (phase === "Trading") {
        return { kind: "noop", entityId: entity.id, reason: "already trading" };
      }
      setBehaviorPhase(entity, "MerchantCoordination", "Trading", {
        marketmakerId: nearestMmId,
      });
      return {
        kind: "trade",
        entityId: entity.id,
        target: nearestMmId,
        goods: 1,
        price: Math.round(p.energy * 20 + 5),
      };
    }

    // Move toward MarketMaker
    p.destX = mp.x;
    p.destY = mp.y;
    setBehaviorPhase(entity, "MerchantCoordination", "Coordinating", {
      marketmakerId: nearestMmId,
    });
    return { kind: "move_to", entityId: entity.id, x: mp.x, y: mp.y };
  },
};

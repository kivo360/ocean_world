import type { Entity } from "../simulation/entity";
import { emit, getEntity, setBehaviorPhase, type World } from "../simulation/world";
import type { BehaviorModule } from "./behavior";

const HOARDER_GOODS_THRESHOLD = 15;
const HOARDER_MONEY_THRESHOLD = 250;
const TAX_RATE = 0.08;
const COOLDOWN_TICKS = 8;

// EnforcePolicy: Patrol → Investigating → Levying → Cooldown → Patrol
// Lawkeeper-only. Side-effects financial state directly during decide() — this
// is consistent with how Trade.settle works, just emits a "tax" event instead.
export const EnforcePolicy: BehaviorModule = {
  name: "EnforcePolicy",
  score(entity, world) {
    const cog = entity.components.cognitive;
    const perceived = entity.components.perceived;
    if (!cog || !perceived) return 0;

    const phase = entity.state.EnforcePolicy?.phase ?? "Patrol";
    if (phase === "Cooldown") {
      const since = (entity.state.EnforcePolicy?.data.cooldownUntilTick as number | null) ?? 0;
      if (world.tick < since) return 0.05;
    }

    if (perceived.nearbyIds.length === 0) return 0.1;

    const hoarder = findHoarder(entity, world);
    if (!hoarder) return 0.2;

    // Fairness drives the desire to enforce.
    return 0.6 + 0.4 * cog.values.fairness;
  },
  decide(entity, world) {
    const fin = entity.components.financial;
    if (!fin) return { kind: "noop", entityId: entity.id, reason: "no financial state" };

    const phase = entity.state.EnforcePolicy?.phase ?? "Patrol";
    if (phase === "Cooldown") {
      const since = (entity.state.EnforcePolicy?.data.cooldownUntilTick as number | null) ?? 0;
      if (world.tick >= since) setBehaviorPhase(entity, "EnforcePolicy", "Patrol");
    }

    const target = findHoarder(entity, world);
    if (!target) {
      setBehaviorPhase(entity, "EnforcePolicy", "Patrol");
      return { kind: "noop", entityId: entity.id, reason: "no hoarder nearby" };
    }

    if (phase === "Patrol") {
      setBehaviorPhase(entity, "EnforcePolicy", "Investigating", { target: target.id });
      return {
        kind: "speak",
        entityId: entity.id,
        target: target.id,
        msg: "ledger inspection",
      };
    }

    if (phase === "Investigating") {
      setBehaviorPhase(entity, "EnforcePolicy", "Levying", { target: target.id });
      return {
        kind: "speak",
        entityId: entity.id,
        target: target.id,
        msg: "violation: hoarding",
      };
    }

    // Levying — apply the tax now. Direct mutation + event emission, no Action.
    levyTax(entity, target, world);
    setBehaviorPhase(entity, "EnforcePolicy", "Cooldown", {
      target: target.id,
      cooldownUntilTick: world.tick + COOLDOWN_TICKS,
    });
    return { kind: "noop", entityId: entity.id, reason: "tax collected" };
  },
};

function findHoarder(entity: Entity, world: World): Entity | null {
  const perceived = entity.components.perceived;
  if (!perceived) return null;
  let best: Entity | null = null;
  let bestScore = 0;
  for (const id of perceived.nearbyIds) {
    const other = getEntity(world, id);
    if (!other || other.archetype === "Lawkeeper") continue;
    const f = other.components.financial;
    if (!f) continue;
    const goodsExcess = Math.max(0, f.goods - HOARDER_GOODS_THRESHOLD);
    const moneyExcess = Math.max(0, f.money - HOARDER_MONEY_THRESHOLD) / 50;
    const score = goodsExcess + moneyExcess;
    if (score > bestScore) {
      bestScore = score;
      best = other;
    }
  }
  return best;
}

function levyTax(authority: Entity, target: Entity, world: World): void {
  const af = authority.components.financial;
  const tf = target.components.financial;
  if (!af || !tf) return;
  const tax = Math.max(2, Math.round(tf.money * TAX_RATE));
  if (tf.money < tax) return;
  tf.money -= tax;
  af.money += tax;
  emit(world, {
    kind: "tax",
    source: authority.id,
    target: target.id,
    summary: `${authority.name} levied ${tax} from ${target.name}`,
  });
  world.speechBubbles.set(authority.id, {
    msg: `+${tax} tax`,
    expiresAtTick: world.tick + 4,
  });
  world.speechBubbles.set(target.id, {
    msg: `-${tax}`,
    expiresAtTick: world.tick + 4,
  });
}

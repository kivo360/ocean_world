// Player-emitted actions. The player has no behaviors and is skipped by the
// T1/T2/T3 pipeline, so their actions enter the world via these helpers
// rather than the normal decide → resolve path. They're called directly from
// the App.tsx input handler, in between sim ticks.
//
// What we still want to preserve:
//   - speech goes onto the target's perceived.incomingSpeech so their next
//     decide() can react (Converse already replies to incoming speech)
//   - a speech bubble pops above the player visually
//   - the event lands in world.events AND world.memoryGraph via emit(), so
//     future T3 prompts will recall the player's words

import { PLAYER_ID } from "./archetypes";
import { distanceSq, emit, getEntity, type World } from "./world";

const SPEECH_BUBBLE_LIFETIME = 4;
const DEFAULT_INTERACT_RADIUS = 80;

/** Returns the closest non-player entity within `maxDistance` of the player,
 *  or null. Region-agnostic by default — but if the player is region-gated,
 *  only same-region entities can be interactable since perceive() already
 *  filters that way. */
export function findNearestInteractTarget(
  world: World,
  maxDistance = DEFAULT_INTERACT_RADIUS,
): string | null {
  const player = getEntity(world, PLAYER_ID);
  const pp = player?.components.physical;
  if (!player || !pp) return null;
  const r2 = maxDistance * maxDistance;
  let best: { id: string; d2: number } | null = null;
  for (const other of world.entities.values()) {
    if (other.id === PLAYER_ID) continue;
    const op = other.components.physical;
    if (!op) continue;
    const d2 = distanceSq(pp.x, pp.y, op.x, op.y);
    if (d2 > r2) continue;
    if (!best || d2 < best.d2) best = { id: other.id, d2 };
  }
  return best?.id ?? null;
}

/** Player speaks to a specific entity. Unshifts onto incomingSpeech so the
 *  player's input gets priority over any pending NPC chatter — interactivity
 *  feels broken otherwise. */
export function playerSpeak(world: World, targetId: string, msg: string): void {
  const speaker = getEntity(world, PLAYER_ID);
  const target = getEntity(world, targetId);
  if (!speaker || !target) return;
  if (target.components.perceived) {
    target.components.perceived.incomingSpeech.unshift({ from: speaker.id, msg });
  }
  world.speechBubbles.set(speaker.id, {
    msg,
    expiresAtTick: world.tick + SPEECH_BUBBLE_LIFETIME,
  });
  emit(world, {
    kind: "speech",
    source: speaker.id,
    target: target.id,
    summary: `${speaker.name} → ${target.name}: ${msg}`,
  });
}

/** Brief "..." bubble above the player when they pressed interact but no one
 *  was in range. Pure visual feedback; emits no event. */
export function playerInteractMissed(world: World): void {
  world.speechBubbles.set(PLAYER_ID, {
    msg: "...",
    expiresAtTick: world.tick + 2,
  });
}

export type PendingPlayerOffer = {
  from: string;
  goods: number;
  price: number;
};

/** The first pending trade offer aimed at the player, or null. The list is
 *  cleared each tick by applyPerceivedInputs, so we read whatever the most
 *  recent tick delivered. */
export function pendingPlayerOffer(world: World): PendingPlayerOffer | null {
  const player = getEntity(world, PLAYER_ID);
  const offers = player?.components.perceived?.tradeOffers;
  if (!offers || offers.length === 0) return null;
  return offers[0] ?? null;
}

/** Player accepts an incoming offer: pays the price, takes the goods, emits a
 *  trade event so the graph memory and chat log capture the exchange. Returns
 *  a status string describing what happened — useful for surfacing failure
 *  modes to the UI ("not enough money", "seller is gone"). */
export type AcceptResult =
  | { kind: "ok"; goods: number; price: number; sellerName: string }
  | { kind: "no-offer" }
  | { kind: "seller-gone" }
  | { kind: "no-funds"; have: number; need: number }
  | { kind: "seller-empty" };

export function playerAcceptTrade(world: World, offer: PendingPlayerOffer): AcceptResult {
  const player = getEntity(world, PLAYER_ID);
  const seller = getEntity(world, offer.from);
  const pf = player?.components.financial;
  const sf = seller?.components.financial;
  if (!player || !pf) return { kind: "no-offer" };
  if (!seller || !sf) return { kind: "seller-gone" };
  if (pf.money < offer.price) return { kind: "no-funds", have: pf.money, need: offer.price };
  if (sf.goods < offer.goods) return { kind: "seller-empty" };

  pf.money -= offer.price;
  pf.goods += offer.goods;
  sf.money += offer.price;
  sf.goods -= offer.goods;

  // Pop the consumed offer from the player's perceived list.
  if (player.components.perceived) {
    player.components.perceived.tradeOffers = player.components.perceived.tradeOffers.filter(
      (o) => !(o.from === offer.from && o.goods === offer.goods && o.price === offer.price),
    );
  }

  world.speechBubbles.set(PLAYER_ID, {
    msg: `paid ${offer.price}`,
    expiresAtTick: world.tick + SPEECH_BUBBLE_LIFETIME,
  });
  world.speechBubbles.set(seller.id, {
    msg: "sold!",
    expiresAtTick: world.tick + SPEECH_BUBBLE_LIFETIME,
  });

  emit(world, {
    kind: "trade",
    source: seller.id,
    target: player.id,
    summary: `${seller.name} sold ${offer.goods} to ${player.name} for ${offer.price}`,
  });

  return { kind: "ok", goods: offer.goods, price: offer.price, sellerName: seller.name };
}

/** (#42) Player-initiated trade. Player offers their own goods+money to a
 *  target NPC. If the NPC has matching values that accept the deal, it settles
 *  immediately; otherwise nothing happens (NPC ignores the offer). For now we
 *  use a simple rule: NPC accepts if (price they receive) ≥ (their valuation
 *  of the goods they give), where valuation = 4 + tick%3 to keep it varied. */
export type PlayerOfferResult =
  | { kind: "ok"; goods: number; price: number; partnerName: string }
  | { kind: "no-partner" }
  | { kind: "no-funds"; have: number; need: number }
  | { kind: "no-goods"; have: number; need: number }
  | { kind: "rejected"; partnerName: string };

export function playerOfferTrade(
  world: World,
  targetId: string,
  goodsFromPlayer: number,
  moneyFromPlayer: number,
): PlayerOfferResult {
  const player = getEntity(world, PLAYER_ID);
  const partner = getEntity(world, targetId);
  const pf = player?.components.financial;
  const tf = partner?.components.financial;
  if (!player || !pf) return { kind: "no-partner" };
  if (!partner || !tf) return { kind: "no-partner" };
  if (moneyFromPlayer > 0 && pf.money < moneyFromPlayer) {
    return { kind: "no-funds", have: pf.money, need: moneyFromPlayer };
  }
  if (goodsFromPlayer > 0 && pf.goods < goodsFromPlayer) {
    return { kind: "no-goods", have: pf.goods, need: goodsFromPlayer };
  }

  // The partner gives the opposite side of the deal: if the player offers
  // goods, they want money back, and vice versa. The amount the partner
  // returns is the SAME as what the player offered on the other axis. Net:
  // it's a swap between (goods, money) — player gives some of each, partner
  // gives some of each back from their inventory.
  const goodsForPartner = goodsFromPlayer;
  const moneyForPartner = moneyFromPlayer;
  const goodsFromPartner = moneyFromPlayer; // partner pays goods worth `money`
  const moneyFromPartner = goodsFromPlayer * 4; // partner pays 4¢ per good

  // Acceptance rule: partner needs the inventory to settle.
  if (tf.money < moneyFromPartner) {
    return { kind: "rejected", partnerName: partner.name };
  }
  if (tf.goods < goodsFromPartner) {
    return { kind: "rejected", partnerName: partner.name };
  }

  pf.goods -= goodsForPartner;
  pf.money -= moneyForPartner;
  tf.goods += goodsForPartner;
  tf.money += moneyForPartner;
  pf.goods += goodsFromPartner;
  pf.money += moneyFromPartner;
  tf.goods -= goodsFromPartner;
  tf.money -= moneyFromPartner;

  world.speechBubbles.set(PLAYER_ID, {
    msg: "deal!",
    expiresAtTick: world.tick + SPEECH_BUBBLE_LIFETIME,
  });
  world.speechBubbles.set(partner.id, {
    msg: "ok",
    expiresAtTick: world.tick + SPEECH_BUBBLE_LIFETIME,
  });

  emit(world, {
    kind: "trade",
    source: player.id,
    target: partner.id,
    summary: `${player.name} traded ${goodsFromPlayer}g+${moneyFromPlayer}¢ to ${partner.name} for ${goodsFromPartner}g+${moneyFromPartner}¢`,
  });

  return {
    kind: "ok",
    goods: goodsFromPartner - goodsFromPlayer,
    price: moneyFromPartner - moneyFromPlayer,
    partnerName: partner.name,
  };
}

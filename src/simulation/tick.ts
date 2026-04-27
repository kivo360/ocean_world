import type { REGISTRY } from "../behaviors/registry";
import type { T3Queue } from "../llm/t3-queue";
import { t3ActionToTickAction } from "../llm/t3-queue";
import type { OntologyReasoner } from "../ontology/oxigraph-reasoner";
import type { Action, WorldEvent } from "./actions";
import type { Values } from "./components";
import type { BehaviorName, Entity } from "./entity";
import { findRegion } from "./regions";
import { expireActiveScenario, maybeRunScenario } from "./scenarios";
import {
  emit,
  entityActivity,
  findNearby,
  getEntity,
  type EntityActivity,
  type World,
} from "./world";

type Registry = typeof REGISTRY;

// T2 winner under this score → escalate to T3 LLM deliberation. Bumped from
// the original 0.08 because most ambient ticks have a clear T2 winner above
// that, which meant the LLM never actually fired. 0.25 makes it visible.
const T3_ESCALATION_THRESHOLD = 0.25;

// Even when T2 wins clearly, force every entity to T3 every N ticks so the
// LLM gets a say on a reliable cadence. Spread across entities by id-hash to
// avoid clumping all calls in one tick.
const T3_FORCE_INTERVAL_TICKS = 80;

// Inactive regions don't tick every step — they tick every Nth step at T2-only
// fidelity (no T3 LLM escalation). The world keeps living when the player is
// elsewhere, but at a tiny fraction of the cost. Active region: every tick,
// full T1/T2/T3.
const AMBIENT_TICK_INTERVAL = 10;

const SPEECH_BUBBLE_LIFETIME = 4;

function entityIdHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// -- Active region ------------------------------------------------------------
// The player's position determines which region is "live" each tick. Outside-
// region entities are frozen — see isEntityActive.
function updateActiveRegion(world: World): void {
  if (world.regions.length === 0) {
    world.activeRegionId = null;
    return;
  }
  for (const e of world.entities.values()) {
    if (e.archetype !== "Player") continue;
    const p = e.components.physical;
    if (!p) continue;
    const r = findRegion(world.regions, p.x, p.y);
    world.activeRegionId = r?.id ?? world.activeRegionId; // sticky if outside all
    return;
  }
}

// -- Perceive -----------------------------------------------------------------
function perceive(world: World, ambientFrame: boolean): void {
  for (const entity of world.entities.values()) {
    const mode = entityActivity(world, entity, ambientFrame);
    if (mode === "frozen") continue;
    const perceived = entity.components.perceived;
    const physical = entity.components.physical;
    if (!perceived || !physical) continue;

    // Drain transient inputs; they were produced by last tick's resolve phase.
    perceived.nearbyIds = findNearby(world, entity, physical.perceptionRadius).map((e) => e.id);
  }
}

// -- Decide (T1 + T2) ---------------------------------------------------------
// T1: currently-active behavior gets priority if its state machine has
// committed to a phase that shouldn't be interrupted (Speaking, Offering,
// Resting mid-recovery). Otherwise T2 compares all behaviors by score.

const T1_LOCKED_PHASES: Partial<Record<BehaviorName, Set<string>>> = {
  Converse: new Set(["Listening"]), // mid-response, don't switch out
  Trade: new Set(["Settling"]),
  Rest: new Set(["Resting"]),
  MarkPrice: new Set(["Quoting"]),
  EnforcePolicy: new Set(["Investigating", "Levying"]),
  Gossip: new Set(["Speaking"]),
};

function valueWeight(values: Values, behavior: BehaviorName): number {
  switch (behavior) {
    case "Trade":
      return 0.5 + 0.5 * values.profit;
    case "Converse":
      return 0.5 + 0.5 * values.community;
    case "Wander":
      return 0.5 + 0.5 * values.curiosity;
    case "Rest":
      return 1.0; // survival — no value-weighting per docs/03
    case "MarkPrice":
      return 0.5 + 0.5 * values.profit;
    case "EnforcePolicy":
      return 0.5 + 0.5 * values.fairness;
    case "Gossip":
      return 0.5 + 0.5 * values.community;
  }
}

export type BehaviorChoice = {
  behavior: BehaviorName;
  score: number;
  needsT3: boolean;
};

export function chooseBehavior(entity: Entity, world: World, registry: Registry): BehaviorName {
  return evaluateBehavior(entity, world, registry).behavior;
}

export function evaluateBehavior(
  entity: Entity,
  world: World,
  registry: Registry,
): BehaviorChoice {
  const values = entity.components.cognitive?.values;

  // T1 lock check.
  const activeState = entity.state[entity.activeBehavior];
  if (activeState) {
    const locked = T1_LOCKED_PHASES[entity.activeBehavior];
    if (locked?.has(activeState.phase)) {
      return { behavior: entity.activeBehavior, score: Infinity, needsT3: false };
    }
  }

  // T2 scoring.
  type Scored = { name: BehaviorName; score: number };
  const scores: Scored[] = [];
  for (const name of entity.behaviors) {
    const mod = registry[name];
    const raw = mod.score(entity, world);
    const weight = values ? valueWeight(values, name) : 1;
    scores.push({ name, score: raw * weight });
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0]!;

  // Force a periodic T3 invocation per entity even when T2 wins clearly. The
  // hash spreads firings across ticks so we don't dogpile the LLM at every
  // multiple of the interval.
  const offset = entityIdHash(entity.id) % T3_FORCE_INTERVAL_TICKS;
  const forced = (world.tick + offset) % T3_FORCE_INTERVAL_TICKS === 0;
  return {
    behavior: best.name,
    score: best.score,
    needsT3: forced || best.score < T3_ESCALATION_THRESHOLD,
  };
}

function decide(
  world: World,
  registry: Registry,
  t3Queue: T3Queue | null,
  reasoner: OntologyReasoner | null,
  ambientFrame: boolean,
): Action[] {
  const actions: Action[] = [];
  for (const entity of world.entities.values()) {
    // Player is input-driven; movement is mutated directly from the UI between
    // ticks. Skip T1/T2/T3 entirely so the player never gets a behavior queued.
    if (entity.archetype === "Player") continue;
    const mode: EntityActivity = entityActivity(world, entity, ambientFrame);
    if (mode === "frozen") continue;
    // Ambient NPCs decide via T2 only — no LLM cost — but still emit actions
    // (move, speak, trade) so neighbouring regions visibly evolve.
    const allowT3 = mode === "active" && t3Queue !== null;
    // Priority 1: if T3 already resolved an action for this entity, use it.
    if (allowT3 && t3Queue) {
      const resolved = t3Queue.take(entity.id);
      if (resolved) {
        actions.push(t3ActionToTickAction(entity.id, resolved));
        continue;
      }
    }

    const choice = evaluateBehavior(entity, world, registry);
    entity.activeBehavior = choice.behavior;

    // Ontology guardrail: verify the entity actually satisfies the chosen
    // behavior's required_components. Defense-in-depth — build-time validation
    // already prevents shipping a broken archetype, but this catches bugs in
    // dynamic component changes and surfaces violations to the inspector.
    if (reasoner && reasoner.status().loaded) {
      const componentKeys = Object.keys(entity.components).filter(
        (k) => entity.components[k as keyof typeof entity.components] !== undefined,
      );
      const ok = reasoner.canEntityRunBehavior(
        { archetype: entity.archetype, componentKeys },
        `ecs:${choice.behavior}`,
      );
      if (!ok) {
        const reqs = reasoner.componentsRequiredBy(`ecs:${choice.behavior}`);
        emit(world, {
          kind: "policy_violation",
          source: entity.id,
          summary: `${entity.name} cannot run ${choice.behavior} (requires ${reqs.join(", ")})`,
        });
        world.policyViolations += 1;
        actions.push({
          kind: "noop",
          entityId: entity.id,
          reason: "policy violation",
        });
        continue;
      }
    }

    if (choice.needsT3 && allowT3 && t3Queue) {
      t3Queue.queue(entity.id);
      emit(world, {
        kind: "needs_deliberation",
        source: entity.id,
        summary: `T2 score ${choice.score.toFixed(3)} < threshold; queued for T3`,
      });
      // While we wait, fall back to the best T2 action so ticks stay alive.
      actions.push(registry[choice.behavior].decide(entity, world));
      continue;
    }

    actions.push(registry[choice.behavior].decide(entity, world));
  }
  return actions;
}

// -- Resolve + Apply ----------------------------------------------------------
// Two-phase interactions per docs/03: incoming speech/trade offers land on
// target's perceived inputs to be processed next tick.

type ResolveContext = {
  speechByTarget: Map<string, Array<{ from: string; msg: string }>>;
  offerByTarget: Map<string, Array<{ from: string; goods: number; price: number }>>;
  tradeAcceptances: Array<{
    buyer: string;
    seller: string;
    goods: number;
    price: number;
  }>;
};

function newResolveContext(): ResolveContext {
  return {
    speechByTarget: new Map(),
    offerByTarget: new Map(),
    tradeAcceptances: [],
  };
}

function addSpeech(ctx: ResolveContext, target: string, from: string, msg: string): void {
  const list = ctx.speechByTarget.get(target) ?? [];
  list.push({ from, msg });
  ctx.speechByTarget.set(target, list);
}

function addOffer(
  ctx: ResolveContext,
  target: string,
  from: string,
  goods: number,
  price: number,
): void {
  const list = ctx.offerByTarget.get(target) ?? [];
  list.push({ from, goods, price });
  ctx.offerByTarget.set(target, list);
}

function resolve(world: World, actions: Action[]): ResolveContext {
  const ctx = newResolveContext();

  // First pass: classify and prepare. Conflicts resolved by ordered iteration
  // plus priority (higher profit wins ties for trade acceptance).
  const pendingOffers = new Map<string, { from: string; goods: number; price: number }>();

  for (const action of actions) {
    switch (action.kind) {
      case "move_to":
        applyMove(world, action.entityId, action.x, action.y);
        break;
      case "rest":
        applyRest(world, action.entityId);
        break;
      case "speak":
        applySpeak(world, action, ctx);
        break;
      case "trade":
        handleTrade(world, action, pendingOffers, ctx);
        break;
      case "noop":
      case "needs_deliberation":
        break;
    }
  }

  // Surface unresolved offers for next-tick perception.
  for (const [target, offer] of pendingOffers) {
    addOffer(ctx, target, offer.from, offer.goods, offer.price);
  }
  return ctx;
}

function applyMove(world: World, entityId: string, tx: number, ty: number): void {
  const e = getEntity(world, entityId);
  const p = e?.components.physical;
  if (!e || !p) return;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = p.speed * 3.5;
  if (dist <= step) {
    p.x = tx;
    p.y = ty;
  } else {
    p.x += (dx / dist) * step;
    p.y += (dy / dist) * step;
  }
  p.x = Math.max(10, Math.min(world.bounds.width - 10, p.x));
  p.y = Math.max(10, Math.min(world.bounds.height - 10, p.y));
  p.energy = Math.max(0, p.energy - 0.01);
}

function applyRest(world: World, entityId: string): void {
  const e = getEntity(world, entityId);
  const p = e?.components.physical;
  if (!e || !p) return;
  p.energy = Math.min(1, p.energy + 0.08);
}

function applySpeak(
  world: World,
  action: Extract<Action, { kind: "speak" }>,
  ctx: ResolveContext,
): void {
  const speaker = getEntity(world, action.entityId);
  if (!speaker) return;
  const target = getEntity(world, action.target);
  if (!target) return;
  addSpeech(ctx, target.id, speaker.id, action.msg);
  world.speechBubbles.set(speaker.id, {
    msg: action.msg,
    expiresAtTick: world.tick + SPEECH_BUBBLE_LIFETIME,
  });
  emit(world, {
    kind: "speech",
    source: speaker.id,
    target: target.id,
    summary: `${speaker.name} → ${target.name}: ${action.msg}`,
  });
}

function handleTrade(
  world: World,
  action: Extract<Action, { kind: "trade" }>,
  pendingOffers: Map<string, { from: string; goods: number; price: number }>,
  ctx: ResolveContext,
): void {
  const seller = getEntity(world, action.entityId);
  const buyer = getEntity(world, action.target);
  if (!seller || !buyer) return;

  const buyerPerceived = buyer.components.perceived;
  const hasOfferFromSeller = buyerPerceived?.tradeOffers.some((o) => o.from === seller.id);

  // Is the acting entity accepting a previously-offered trade?
  if (hasOfferFromSeller) {
    settleTrade(world, {
      buyer: seller.id, // acting entity is buyer here
      seller: buyer.id,
      goods: action.goods,
      price: action.price,
    });
    ctx.tradeAcceptances.push({
      buyer: seller.id,
      seller: buyer.id,
      goods: action.goods,
      price: action.price,
    });
    return;
  }

  // Otherwise treat as a fresh offer for next-tick acceptance.
  const existing = pendingOffers.get(buyer.id);
  if (!existing) {
    pendingOffers.set(buyer.id, {
      from: seller.id,
      goods: action.goods,
      price: action.price,
    });
  }
}

function settleTrade(
  world: World,
  t: { buyer: string; seller: string; goods: number; price: number },
): void {
  const buyer = getEntity(world, t.buyer);
  const seller = getEntity(world, t.seller);
  const bf = buyer?.components.financial;
  const sf = seller?.components.financial;
  if (!buyer || !seller || !bf || !sf) return;
  if (bf.money < t.price || sf.goods < t.goods) return;
  bf.money -= t.price;
  sf.money += t.price;
  sf.goods -= t.goods;
  bf.goods += t.goods;
  emit(world, {
    kind: "trade",
    source: seller.id,
    target: buyer.id,
    summary: `${seller.name} sold ${t.goods} to ${buyer.name} for ${t.price}`,
  });
  world.speechBubbles.set(buyer.id, {
    msg: `paid ${t.price}`,
    expiresAtTick: world.tick + SPEECH_BUBBLE_LIFETIME,
  });
  world.speechBubbles.set(seller.id, {
    msg: "sold!",
    expiresAtTick: world.tick + SPEECH_BUBBLE_LIFETIME,
  });
}

function applyPerceivedInputs(world: World, ctx: ResolveContext): void {
  // Clear previous transient inputs first — they were consumed this tick.
  for (const entity of world.entities.values()) {
    const perceived = entity.components.perceived;
    if (!perceived) continue;
    perceived.incomingSpeech = [];
    perceived.tradeOffers = [];
  }
  // Deliver new inputs for next tick.
  for (const [target, msgs] of ctx.speechByTarget) {
    const e = getEntity(world, target);
    if (!e?.components.perceived) continue;
    e.components.perceived.incomingSpeech.push(...msgs);
    const mem = e.components.memory;
    if (mem) {
      for (const m of msgs) {
        mem.recent.push({
          tick: world.tick,
          kind: "heard",
          source: m.from,
          target: e.id,
          summary: m.msg,
        });
      }
      if (mem.recent.length > 20) mem.recent.splice(0, mem.recent.length - 20);
    }
  }
  for (const [target, offers] of ctx.offerByTarget) {
    const e = getEntity(world, target);
    if (!e?.components.perceived) continue;
    e.components.perceived.tradeOffers.push(...offers);
  }
}

// -- Passive decay ------------------------------------------------------------
function passiveDecay(world: World, ambientFrame: boolean): void {
  for (const entity of world.entities.values()) {
    if (entity.archetype === "Player") continue; // no fatigue for the player
    const mode = entityActivity(world, entity, ambientFrame);
    if (mode === "frozen") continue; // frozen NPCs don't tire
    const p = entity.components.physical;
    if (!p) continue;
    p.energy = Math.max(0, p.energy - 0.002);
  }
  // Garbage-collect expired speech bubbles.
  for (const [id, bubble] of world.speechBubbles) {
    if (bubble.expiresAtTick < world.tick) world.speechBubbles.delete(id);
  }
  // Trim the cross-entity graph: drop facts older than 600 ticks, hard-cap 5k.
  if (world.tick % 50 === 0) {
    world.memoryGraph.ttlPrune(world.tick, 600, 5000);
  }
}

// -- Public tick driver -------------------------------------------------------
export type TickOptions = {
  t3Queue?: T3Queue | null;
  reasoner?: OntologyReasoner | null;
};

export function runTick(
  world: World,
  registry: Registry,
  options: TickOptions = {},
): ReadonlyArray<WorldEvent> {
  world.tick += 1;
  const t3Queue = options.t3Queue ?? null;
  const reasoner = options.reasoner ?? null;
  // Active region must be set before any region-gated phase runs.
  updateActiveRegion(world);
  // Ambient frame: also tick non-active regions this step at T2-only fidelity.
  // The world keeps living while you're away — bots in other regions still
  // wander, talk, and trade, just at 1/AMBIENT_TICK_INTERVAL the rate of the
  // active region and without LLM cost.
  const ambientFrame = world.tick % AMBIENT_TICK_INTERVAL === 0;
  // Scenario events fire first so their effects propagate through perception
  // and become part of this tick's decisions.
  maybeRunScenario(world);
  expireActiveScenario(world);
  perceive(world, ambientFrame);
  const actions = decide(world, registry, t3Queue, reasoner, ambientFrame);
  const ctx = resolve(world, actions);
  applyPerceivedInputs(world, ctx);
  passiveDecay(world, ambientFrame);
  // Kick off T3 batch for any newly-queued entities. Non-blocking. Only
  // active-region NPCs get queued (allowT3 gate in decide), so this never
  // fires LLM calls for ambient regions.
  if (t3Queue) t3Queue.beginBatch(world);
  return world.events.slice(-50);
}

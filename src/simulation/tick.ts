import type { REGISTRY } from "../behaviors/registry";
import type { T3Queue } from "../llm/t3-queue";
import { t3ActionToTickAction } from "../llm/t3-queue";
import type { OntologyReasoner } from "../ontology/oxigraph-reasoner";
import type { Action, WorldEvent } from "./actions";
import type { Values } from "./components";
import type { Archetype, BehaviorName, Entity } from "./entity";
import { findRegion } from "./regions";
import { expireActiveScenario, maybeRunScenario } from "./scenarios";
import { spawnEntity } from "./archetypes";
import {
  addEntity,
  emit,
  entityActivity,
  findNearby,
  getCollisions,
  getEntity,
  regionIdOf,
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

// Behavior cooldown: prevent repeating same behavior every tick
const BEHAVIOR_COOLDOWN_TICKS = 3;

// Recency weighting: bias toward behaviors not done recently
const RECENCY_COOLDOWN_PERIOD = 5;
const RECENCY_BONUS = 0.3;

const ARCHETYPE_DECAY_RATES: Record<string, number> = {
  Person: 0.002,
  Merchant: 0.001,
  Wanderer: 0.003,
  MarketMaker: 0.001,
  Lawkeeper: 0.002,
  Player: 0,
};

const BEHAVIOR_ENERGY_COSTS: Partial<Record<BehaviorName, number>> = {
  Wander: 0.003,
  Converse: 0.001,
  Trade: 0.002,
  Rest: -0.005,
};

const STARVING_GRACE_TICKS = 3;
const BIRTH_INTERVAL = 50;
const POPULATION_HISTORY_WINDOW = 10;

const DENSITY_TARGET_DENOMINATOR = 20000;

// Archetype spawn weights for births (based on smallVillage proportions)
const BIRTH_ARCHETYPE_WEIGHTS: Array<{ archetype: Archetype; weight: number }> = [
  { archetype: "Person", weight: 60 },
  { archetype: "Merchant", weight: 6 },
  { archetype: "Wanderer", weight: 18 },
  { archetype: "MarketMaker", weight: 3 },
  { archetype: "Lawkeeper", weight: 2 },
];

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
  MerchantCoordination: new Set(["Trading"]),
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
    case "GroupUp":
      return 0.5 + 0.5 * values.community;
    case "AvoidLawkeepers":
      return 0.5 + 0.5 * (1 - values.fairness);
    case "PursueViolators":
      return 0.5 + 0.5 * values.fairness;
    case "MerchantCoordination":
      return 0.5 + 0.5 * values.profit;
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
    // Behavior cooldown check: skip if on cooldown
    const cooldownExpiry = entity.cooldowns[name];
    if (cooldownExpiry !== undefined && world.tick < cooldownExpiry) {
      continue;
    }

    const mod = registry[name];
    const raw = mod.score(entity, world);
    const weight = values ? valueWeight(values, name) : 1;

    // Memory recency weighting: bias toward behaviors not done recently
    const lastTick = entity.lastBehaviorTick[name];
    let recencyMultiplier = 1;
    if (lastTick !== undefined) {
      const ticksSinceLast = world.tick - lastTick;
      const recencyFactor = Math.max(0, 1 - ticksSinceLast / RECENCY_COOLDOWN_PERIOD);
      recencyMultiplier = 1 + RECENCY_BONUS * recencyFactor;
    } else {
      // Never done this behavior: maximum recency bonus
      recencyMultiplier = 1 + RECENCY_BONUS;
    }

    // Mood modifier: mood (0-1) multiplies score by (0.5 + mood).
    // Low mood (0) halves scores; high mood (1) multiplies by 1.5.
    const mood = entity.components.cognitive?.mood ?? 0.5;
    const moodMultiplier = 0.5 + mood;

    scores.push({ name, score: raw * weight * recencyMultiplier * moodMultiplier });
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

  // T3 regional budget/backpressure: pre-count active entities per region
  const regionActiveCounts = new Map<string, number>();
  for (const entity of world.entities.values()) {
    if (entity.archetype === "Player") continue;
    const mode = entityActivity(world, entity, ambientFrame);
    if (mode === "frozen") continue;
    const regionId = regionIdOf(world, entity);
    if (regionId) {
      regionActiveCounts.set(regionId, (regionActiveCounts.get(regionId) ?? 0) + 1);
    }
  }

  // Calculate per-region T3 budget cap
  const regionT3Budget = new Map<string, number>();
  for (const [regionId, count] of regionActiveCounts) {
    regionT3Budget.set(regionId, Math.max(3, Math.floor(count * 0.3)));
  }

  // Track T3 queueings per region this tick
  const regionT3Queued = new Map<string, number>();

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

    // Set behavior cooldown and track last performed tick
    entity.cooldowns[choice.behavior] = world.tick + BEHAVIOR_COOLDOWN_TICKS;
    entity.lastBehaviorTick[choice.behavior] = world.tick;

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
      // Check T3 regional budget before queueing
      const regionId = regionIdOf(world, entity);
      const t3Queued = regionId ? (regionT3Queued.get(regionId) ?? 0) : 0;
      const t3Budget = regionId ? (regionT3Budget.get(regionId) ?? Infinity) : Infinity;

      if (t3Queued < t3Budget) {
        // Within budget: queue for T3
        if (regionId) {
          regionT3Queued.set(regionId, t3Queued + 1);
        }
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
      // Budget exceeded: fall through to T2 action directly
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
  let nx: number;
  let ny: number;
  if (dist <= step) {
    nx = tx;
    ny = ty;
  } else {
    nx = p.x + (dx / dist) * step;
    ny = p.y + (dy / dist) * step;
  }
  nx = Math.max(10, Math.min(world.bounds.width - 10, nx));
  ny = Math.max(10, Math.min(world.bounds.height - 10, ny));

  const entityHalfW = 6;
  const entityHalfH = 6;
  if (
    getCollisions(
      world,
      nx - entityHalfW,
      ny - entityHalfH,
      entityHalfW * 2,
      entityHalfH * 2,
    )
  ) {
    p.energy = Math.max(0, p.energy - 0.005);
    return;
  }

  p.x = nx;
  p.y = ny;
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

// -- Passive decay (metabolism) -----------------------------------------------
function passiveDecay(world: World, ambientFrame: boolean): void {
  for (const entity of world.entities.values()) {
    if (entity.archetype === "Player") continue;
    const mode = entityActivity(world, entity, ambientFrame);
    if (mode === "frozen") continue;
    const p = entity.components.physical;
    if (!p) continue;

    const baseRate = ARCHETYPE_DECAY_RATES[entity.archetype] ?? 0.002;
    let decay = baseRate;

    const behaviorCost = BEHAVIOR_ENERGY_COSTS[entity.activeBehavior];
    if (behaviorCost !== undefined) {
      decay += behaviorCost;
    } else {
      decay += 0.001; // mild cost for other behaviors
    }

    if (entity.activeBehavior === "PursueViolators") {
      decay += 0.004;
    }

    p.energy = Math.max(0, p.energy - decay);

    // Mood decay: drift toward neutral (0.5) each tick.
    const cog = entity.components.cognitive;
    if (cog && cog.mood !== undefined) {
      if (cog.mood > 0.5) cog.mood = Math.max(0.5, cog.mood - 0.01);
      else if (cog.mood < 0.5) cog.mood = Math.min(0.5, cog.mood + 0.01);
    }

    // Long-term savings: draw from savings to buy food when energy is low
    const f = entity.components.financial;
    if (p.energy < 0.3 && f && f.savings > 0) {
      const draw = Math.min(f.savings, 2);
      f.savings -= draw;
      p.energy = Math.min(1, p.energy + draw * 0.15);
    }

    if (p.energy <= 0) {
      entity.starvingTicks = (entity.starvingTicks ?? 0) + 1;
    } else {
      entity.starvingTicks = 0;
    }
  }

  // Every 10 ticks: entities save toward long-term goals
  if (world.tick % 10 === 0) {
    for (const entity of world.entities.values()) {
      if (entity.archetype === "Player") continue;
      const f = entity.components.financial;
      if (!f) continue;
      const amount = world.rng.int(1, 3);
      const actual = Math.min(amount, f.money);
      f.money -= actual;
      f.savings += actual;
    }
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

// -- Death lifecycle ----------------------------------------------------------
function processDeath(world: World): void {
  const deadIds: string[] = [];
  for (const entity of world.entities.values()) {
    if (entity.archetype === "Player") continue;
    if (entity.starvingTicks !== undefined && entity.starvingTicks >= STARVING_GRACE_TICKS) {
      deadIds.push(entity.id);
    }
  }
  for (const id of deadIds) {
    const entity = world.entities.get(id);
    if (!entity) continue;
    emit(world, {
      kind: "death",
      source: id,
      summary: `${entity.name} starved after ${entity.starvingTicks} ticks without energy`,
    });
    world.entities.delete(id);
    world.order = world.order.filter((eid) => eid !== id);
    world.speechBubbles.delete(id);
  }
}

// -- Birth lifecycle ----------------------------------------------------------
function processBirth(world: World): void {
  const target = Math.floor((world.bounds.width * world.bounds.height) / DENSITY_TARGET_DENOMINATOR);
  const currentCount = world.entities.size;
  if (currentCount >= target) return;

  const gap = target - currentCount;
  const toSpawn = Math.min(gap, 3);

  for (let i = 0; i < toSpawn; i++) {
    const pick = world.rng.range(0, 1);
    let cumulative = 0;
    const totalWeight = BIRTH_ARCHETYPE_WEIGHTS.reduce((sum, aw) => sum + aw.weight, 0);
    let chosenArchetype: Archetype = "Person";
    for (const entry of BIRTH_ARCHETYPE_WEIGHTS) {
      cumulative += entry.weight / totalWeight;
      if (pick <= cumulative) {
        chosenArchetype = entry.archetype;
        break;
      }
    }

    const same = Array.from(world.entities.values()).filter(
      (e) => e.archetype === chosenArchetype && e.components.physical,
    );
    let spawnX: number;
    let spawnY: number;
    if (same.length > 0) {
      const cluster = same[world.rng.int(0, same.length - 1)]!;
      const cp = cluster.components.physical!;
      spawnX = Math.max(20, Math.min(world.bounds.width - 20, cp.x + world.rng.range(-40, 40)));
      spawnY = Math.max(20, Math.min(world.bounds.height - 20, cp.y + world.rng.range(-40, 40)));
    } else {
      spawnX = world.rng.range(40, world.bounds.width - 40);
      spawnY = world.rng.range(40, world.bounds.height - 40);
    }

    const entity = spawnEntity({
      archetype: chosenArchetype,
      rng: world.rng,
      bounds: world.bounds,
      tick: world.tick,
      x: spawnX,
      y: spawnY,
    });
    if (entity.components.physical) {
      entity.components.physical.energy = 0.4 + world.rng.range(0, 0.2);
    }

    addEntity(world, entity);
    emit(world, {
      kind: "birth",
      source: entity.id,
      summary: `${entity.name} (${chosenArchetype}) was born`,
    });
  }
}

function updateDensityTuning(world: World): void {
  world.populationHistory.push(world.entities.size);
  if (world.populationHistory.length > POPULATION_HISTORY_WINDOW) {
    world.populationHistory.shift();
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
  processDeath(world);
  if (world.tick % BIRTH_INTERVAL === 0) {
    processBirth(world);
  }
  updateDensityTuning(world);
  // Kick off T3 batch for any newly-queued entities. Non-blocking. Only
  // active-region NPCs get queued (allowT3 gate in decide), so this never
  // fires LLM calls for ambient regions.
  if (t3Queue) t3Queue.beginBatch(world);
  // Snapshot for deterministic replay if a recorder is attached.
  if (world.replayRecorder) world.replayRecorder.record(world);
  return world.events.slice(-50);
}

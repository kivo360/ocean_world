import type { Archetype, BehaviorName, Entity } from "./entity";
import type { Values } from "./components";
import type { Rng } from "./rng";
import type { WorldBounds } from "./world";

type ArchetypeSpec = {
  behaviors: BehaviorName[];
  baseEnergy: number;
  baseMoney: number;
  baseGoods: number;
  speed: number;
  perception: number;
  valueRanges: Record<keyof Values, [number, number]>;
  nameRoots: readonly string[];
};

const ARCHETYPES: Record<Archetype, ArchetypeSpec> = {
  Person: {
    behaviors: ["Wander", "Converse", "Trade", "Rest", "GroupUp", "AvoidLawkeepers", "Schedule"],
    baseEnergy: 0.8,
    baseMoney: 50,
    baseGoods: 2,
    speed: 1.3,
    perception: 70,
    valueRanges: {
      profit: [0.3, 0.6],
      community: [0.3, 0.7],
      curiosity: [0.3, 0.8],
      fairness: [0.4, 0.7],
      autonomy: [0.4, 0.7],
    },
    nameRoots: ["Ana", "Beto", "Carmen", "Diego", "Elena", "Felipe", "Gabi", "Hugo", "Ines", "Julio"],
  },
  Merchant: {
    behaviors: ["Trade", "Converse", "Rest", "AvoidLawkeepers", "MerchantCoordination", "Schedule"],
    baseEnergy: 0.9,
    baseMoney: 200,
    baseGoods: 12,
    speed: 0.6,
    perception: 110,
    valueRanges: {
      profit: [0.7, 0.95],
      community: [0.2, 0.5],
      curiosity: [0.2, 0.5],
      fairness: [0.4, 0.8],
      autonomy: [0.5, 0.8],
    },
    nameRoots: ["Otilia", "Paco", "Queta", "Ramon", "Sofia", "Tomas"],
  },
  Wanderer: {
    behaviors: ["Wander", "Converse", "Rest", "GroupUp", "AvoidLawkeepers", "Schedule"],
    baseEnergy: 1.0,
    baseMoney: 10,
    baseGoods: 1,
    speed: 1.8,
    perception: 140,
    valueRanges: {
      profit: [0.1, 0.3],
      community: [0.2, 0.5],
      curiosity: [0.7, 0.95],
      fairness: [0.3, 0.7],
      autonomy: [0.7, 0.95],
    },
    nameRoots: ["Uma", "Vito", "Wren", "Xio", "Yara", "Zeno"],
  },
  MarketMaker: {
    behaviors: ["MarkPrice", "Trade", "Converse", "Rest", "Schedule"],
    baseEnergy: 0.95,
    baseMoney: 400,
    baseGoods: 25,
    speed: 0.3, // nearly stationary
    perception: 150,
    valueRanges: {
      profit: [0.8, 0.95],
      community: [0.2, 0.4],
      curiosity: [0.1, 0.3],
      fairness: [0.5, 0.85],
      autonomy: [0.4, 0.7],
    },
    nameRoots: ["Marek", "Nadia", "Osvaldo", "Petra"],
  },
  Lawkeeper: {
    behaviors: ["EnforcePolicy", "Wander", "Converse", "Rest", "PursueViolators", "Schedule"],
    baseEnergy: 0.9,
    baseMoney: 100,
    baseGoods: 0,
    speed: 1.5,
    perception: 130,
    valueRanges: {
      profit: [0.1, 0.3],
      community: [0.5, 0.8],
      curiosity: [0.2, 0.4],
      fairness: [0.85, 0.99],
      autonomy: [0.4, 0.6],
    },
    nameRoots: ["Lex", "Mira", "Nestor", "Rhea"],
  },
  // Player is input-driven. Spec is present so Record<Archetype, ...> stays
  // exhaustive; spawnEntity() never reads it because player creation goes
  // through spawnPlayer().
  Player: {
    behaviors: [],
    baseEnergy: 1,
    baseMoney: 0,
    baseGoods: 0,
    speed: 0,
    perception: 100,
    valueRanges: {
      profit: [0, 0],
      community: [0, 0],
      curiosity: [0, 0],
      fairness: [0, 0],
      autonomy: [0, 0],
    },
    nameRoots: ["You"],
  },
};

let entityCounter = 0;

export function resetEntityCounter(): void {
  entityCounter = 0;
}

function pickValue(rng: Rng, range: [number, number]): number {
  return Math.round(rng.range(range[0], range[1]) * 100) / 100;
}

export function spawnEntity(opts: {
  archetype: Archetype;
  rng: Rng;
  bounds: WorldBounds;
  tick: number;
  x?: number;
  y?: number;
}): Entity {
  const spec = ARCHETYPES[opts.archetype];
  const id = `e${(++entityCounter).toString(36)}`;
  const root = spec.nameRoots[opts.rng.int(0, spec.nameRoots.length - 1)]!;
  const values: Values = {
    profit: pickValue(opts.rng, spec.valueRanges.profit),
    community: pickValue(opts.rng, spec.valueRanges.community),
    curiosity: pickValue(opts.rng, spec.valueRanges.curiosity),
    fairness: pickValue(opts.rng, spec.valueRanges.fairness),
    autonomy: pickValue(opts.rng, spec.valueRanges.autonomy),
  };
  const entity: Entity = {
    id,
    name: `${root}·${id.slice(1)}`,
    archetype: opts.archetype,
    components: {
      physical: {
        x: opts.x ?? opts.rng.range(40, opts.bounds.width - 40),
        y: opts.y ?? opts.rng.range(40, opts.bounds.height - 40),
        speed: spec.speed,
        perceptionRadius: spec.perception,
        energy: spec.baseEnergy,
        destX: null,
        destY: null,
      },
      cognitive: {
        values,
        attentionFocus: null,
        workingMemoryLoad: 0,
        mood: 0.5,
        reputation: {},
      },
      financial: {
        money: spec.baseMoney + opts.rng.int(-10, 10),
        goods: spec.baseGoods,
        savings: 0,
      },
      inventory: { items: {} },
      memory: { recent: [] },
      perceived: { nearbyIds: [], incomingSpeech: [], tradeOffers: [] },
    },
    behaviors: spec.behaviors,
    state: {
      Wander: undefined,
      Trade: undefined,
      Converse: undefined,
      Rest: undefined,
      MarkPrice: undefined,
      EnforcePolicy: undefined,
      GroupUp: undefined,
      AvoidLawkeepers: undefined,
      PursueViolators: undefined,
      MerchantCoordination: undefined,
      Schedule: undefined,
    },
    activeBehavior: spec.behaviors[0]!,
    createdTick: opts.tick,
    lastBehaviorTick: {},
    cooldowns: {},
  };
  return entity;
}

export const PLAYER_ID = "player";

export function spawnPlayer(opts: {
  bounds: WorldBounds;
  tick: number;
  x?: number;
  y?: number;
}): Entity {
  return {
    id: PLAYER_ID,
    name: "You",
    archetype: "Player",
    components: {
      physical: {
        x: opts.x ?? opts.bounds.width / 2,
        y: opts.y ?? opts.bounds.height / 2,
        speed: 0, // input-driven; movement handled outside the tick loop.
        perceptionRadius: 100,
        energy: 1,
        destX: null,
        destY: null,
      },
      // Perceived enables NPCs to speak/trade toward the player; incoming
      // entries collect for inspection and surface in the chat panel.
      perceived: { nearbyIds: [], incomingSpeech: [], tradeOffers: [] },
      // Starting wallet so the player can accept Merchant offers. Goods
      // accumulate as they buy and could later be sold back.
      financial: { money: 100, goods: 0, savings: 0 },
    },
    behaviors: [],
    state: {
      Wander: undefined,
      Trade: undefined,
      Converse: undefined,
      Rest: undefined,
      MarkPrice: undefined,
      EnforcePolicy: undefined,
      GroupUp: undefined,
      AvoidLawkeepers: undefined,
      PursueViolators: undefined,
      MerchantCoordination: undefined,
      Schedule: undefined,
    },
    // Placeholder — decide() short-circuits before reading this for players.
    activeBehavior: "Wander",
    createdTick: opts.tick,
    lastBehaviorTick: {},
    cooldowns: {},
  };
}

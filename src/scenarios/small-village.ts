import { spawnEntity, resetEntityCounter } from "../simulation/archetypes";
import type { GraphMemory } from "../simulation/graph-memory";
import type { Region } from "../simulation/regions";
import { createRng } from "../simulation/rng";
import { addEntity, createWorld, type World } from "../simulation/world";

export type ScenarioOptions = {
  seed?: number;
  width?: number;
  height?: number;
  personCount?: number;
  merchantCount?: number;
  wandererCount?: number;
  marketMakerCount?: number;
  lawkeeperCount?: number;
  memoryGraph?: GraphMemory;
};

// Tile the world into a 2x2 grid of regions. Only the player's current region
// ticks each step, so NPC simulation cost is bounded by region population
// instead of total world population. See ROADMAP.md → Shape A.
function buildRegions(width: number, height: number): Region[] {
  const halfW = width / 2;
  const halfH = height / 2;
  return [
    { id: "town-square", name: "Town Square", bounds: { x: 0, y: 0, w: halfW, h: halfH } },
    { id: "market-row", name: "Market Row", bounds: { x: halfW, y: 0, w: halfW, h: halfH } },
    { id: "old-fields", name: "Old Fields", bounds: { x: 0, y: halfH, w: halfW, h: halfH } },
    {
      id: "driftwood-coast",
      name: "Driftwood Coast",
      bounds: { x: halfW, y: halfH, w: halfW, h: halfH },
    },
  ];
}

export function smallVillage(opts: ScenarioOptions = {}): World {
  const seed = opts.seed ?? 1337;
  const bounds = { width: opts.width ?? 1100, height: opts.height ?? 700 };
  const rng = createRng(seed);
  const regions = buildRegions(bounds.width, bounds.height);
  const world = createWorld({ bounds, rng, memoryGraph: opts.memoryGraph, regions });
  resetEntityCounter();

  const persons = opts.personCount ?? 60;
  const merchants = opts.merchantCount ?? 6;
  const wanderers = opts.wandererCount ?? 18;
  const marketMakers = opts.marketMakerCount ?? 3;
  const lawkeepers = opts.lawkeeperCount ?? 2;

  for (let i = 0; i < persons; i++) {
    addEntity(world, spawnEntity({ archetype: "Person", rng, bounds, tick: 0 }));
  }
  for (let i = 0; i < merchants; i++) {
    addEntity(world, spawnEntity({ archetype: "Merchant", rng, bounds, tick: 0 }));
  }
  for (let i = 0; i < wanderers; i++) {
    addEntity(world, spawnEntity({ archetype: "Wanderer", rng, bounds, tick: 0 }));
  }
  for (let i = 0; i < marketMakers; i++) {
    addEntity(world, spawnEntity({ archetype: "MarketMaker", rng, bounds, tick: 0 }));
  }
  for (let i = 0; i < lawkeepers; i++) {
    addEntity(world, spawnEntity({ archetype: "Lawkeeper", rng, bounds, tick: 0 }));
  }
  return world;
}

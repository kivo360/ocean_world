import { spawnEntity, resetEntityCounter } from "../simulation/archetypes";
import type { BiomeName } from "../simulation/biome";
import { resetDecorationCounter } from "../simulation/decoration";
import type { GraphMemory } from "../simulation/graph-memory";
import type { Region } from "../simulation/regions";
import { createRng } from "../simulation/rng";
import { addEntity, createWorld, spawnDecorations, type World } from "../simulation/world";

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

function buildRegions(width: number, height: number): Region[] {
  const topH = Math.round(height * 0.375);
  const colW = Math.round(width / 3);
  const bottomW = Math.round(width / 2);

  const biome = (name: BiomeName): BiomeName => name;

  return [
    {
      id: "town-square",
      name: "Town Square",
      bounds: { x: 0, y: 0, w: colW, h: topH },
      biome: biome("town-square"),
    },
    {
      id: "market-row",
      name: "Market Row",
      bounds: { x: colW, y: 0, w: colW, h: topH },
      biome: biome("market-row"),
    },
    {
      id: "garrison",
      name: "Garrison",
      bounds: { x: colW * 2, y: 0, w: width - colW * 2, h: topH },
      biome: biome("garrison"),
    },
    {
      id: "driftwood-coast",
      name: "Driftwood Coast",
      bounds: { x: 0, y: topH, w: bottomW, h: height - topH },
      biome: biome("driftwood"),
    },
    {
      id: "wilds",
      name: "Wilds",
      bounds: { x: bottomW, y: topH, w: width - bottomW, h: height - topH },
      biome: biome("wilds"),
    },
  ];
}

export function smallVillage(opts: ScenarioOptions = {}): World {
  const seed = opts.seed ?? 1337;
  const bounds = { width: opts.width ?? 2400, height: opts.height ?? 1600 };
  const rng = createRng(seed);
  const regions = buildRegions(bounds.width, bounds.height);
  const world = createWorld({ bounds, rng, memoryGraph: opts.memoryGraph, regions });
  resetEntityCounter();
  resetDecorationCounter();

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
  spawnDecorations(world, regions);
  return world;
}

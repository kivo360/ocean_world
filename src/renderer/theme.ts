import type { Archetype } from "../simulation/entity";

export const ARCHETYPE_COLORS: Record<Archetype, number> = {
  Person: 0x7dd3fc, // sky
  Merchant: 0xfbbf24, // amber
  Wanderer: 0xa78bfa, // violet
  MarketMaker: 0xf472b6, // pink — set apart from amber merchants
  Lawkeeper: 0x4ade80, // green
  Player: 0xf8fafc, // near-white — pop against any backdrop
};

export const ARCHETYPE_RADIUS: Record<Archetype, number> = {
  Person: 5,
  Merchant: 7,
  Wanderer: 5,
  MarketMaker: 9,
  Lawkeeper: 7,
  Player: 8,
};

// Five distinct biomes that define the visual identity and decoration rules for
// each region of the world. Each biome controls ground colour, how densely
// static decorations (trees, rocks, signposts) are placed, how many buildings
// appear, and which ambient animated objects decorate the space.

export type BiomeName =
  | "town-square"
  | "market-row"
  | "driftwood"
  | "garrison"
  | "wilds";

export type AmbientObjectConfig = {
  /** Which ambient decoration kind appears in this biome. */
  kind: "flag" | "smoke";
  /** Probability (0–1) that this ambient kind is placed instead of a static
   *  decoration at each generated slot. */
  chance: number;
};

export type BiomeConfig = {
  id: BiomeName;
  name: string;
  description: string;
  /** Ground fill colour as a 24-bit RGB integer. */
  groundColor: number;
  /** Approximate decorations per 10 000 square pixels. Higher = denser. */
  decorationDensity: number;
  /** Probability (0–1) that a 200×200 grid cell spawns a building. */
  buildingChance: number;
  /** Probability weight for each static decoration kind. Must sum to 1.0
   *  (the remainder after ambient objects are drawn). */
  treeChance: number;
  rockChance: number;
  signpostChance: number;
  /** Ambient animated objects that sway or pulse in this biome. */
  ambientObjects: AmbientObjectConfig[];
};

export const BIOMES: Record<BiomeName, BiomeConfig> = {
  "town-square": {
    id: "town-square",
    name: "Town Square",
    description: "The village heart — paved, busy, lined with shops and stalls.",
    groundColor: 0xd4a574,
    decorationDensity: 15,
    buildingChance: 0.25,
    treeChance: 0.40,
    rockChance: 0.10,
    signpostChance: 0.50,
    ambientObjects: [
      { kind: "flag", chance: 0.06 },
      { kind: "smoke", chance: 0.02 },
    ],
  },
  "market-row": {
    id: "market-row",
    name: "Market Row",
    description: "Crowded stalls, haggling merchants, imported wares from distant ports.",
    groundColor: 0xc4956a,
    decorationDensity: 18,
    buildingChance: 0.20,
    treeChance: 0.35,
    rockChance: 0.10,
    signpostChance: 0.55,
    ambientObjects: [
      { kind: "flag", chance: 0.08 },
      { kind: "smoke", chance: 0.03 },
    ],
  },
  driftwood: {
    id: "driftwood",
    name: "Driftwood",
    description: "A windswept coast where tide-worn timber washes ashore.",
    groundColor: 0xe8d5b7,
    decorationDensity: 22,
    buildingChance: 0.0,
    treeChance: 0.15,
    rockChance: 0.80,
    signpostChance: 0.05,
    ambientObjects: [
      { kind: "smoke", chance: 0.01 },
    ],
  },
  garrison: {
    id: "garrison",
    name: "Garrison",
    description: "Fortified barracks where lawkeepers train and patrol routes begin.",
    groundColor: 0x8a8a7a,
    decorationDensity: 10,
    buildingChance: 0.30,
    treeChance: 0.30,
    rockChance: 0.30,
    signpostChance: 0.40,
    ambientObjects: [
      { kind: "flag", chance: 0.10 },
      { kind: "smoke", chance: 0.04 },
    ],
  },
  wilds: {
    id: "wilds",
    name: "Wilds",
    description: "Untamed woodland — thick canopy, tangled roots, and hidden trails.",
    groundColor: 0x4a7a3a,
    decorationDensity: 35,
    buildingChance: 0.0,
    treeChance: 0.80,
    rockChance: 0.15,
    signpostChance: 0.05,
    ambientObjects: [
      { kind: "smoke", chance: 0.005 },
    ],
  },
};

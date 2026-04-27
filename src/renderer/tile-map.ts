/** Tile types for the ocean-world terrain. */
export enum TileType {
  DeepWater = 0,
  ShallowWater = 1,
  Sand = 2,
  Rock = 3,
  Coral = 4,
}

/** Colour for each tile type (hex, for Pixi / CSS). */
export const TILE_COLORS: Record<TileType, number> = {
  [TileType.DeepWater]: 0x0a1a2f,
  [TileType.ShallowWater]: 0x1a3a5c,
  [TileType.Sand]: 0xc2b280,
  [TileType.Rock]: 0x5a5a5a,
  [TileType.Coral]: 0xff7f50,
};

/** Human-readable label. */
export const TILE_LABELS: Record<TileType, string> = {
  [TileType.DeepWater]: "deep water",
  [TileType.ShallowWater]: "shallow water",
  [TileType.Sand]: "sand",
  [TileType.Rock]: "rock",
  [TileType.Coral]: "coral",
};

export type TileMap = {
  /** Width in tiles. */
  cols: number;
  /** Height in tiles. */
  rows: number;
  /** Size of one tile in world pixels. */
  tileSize: number;
  /** Flat array of tile types, row-major. */
  tiles: Uint8Array;
};

/** Simple deterministic 2-D value noise (no external deps). */
function valueNoise2D(x: number, y: number, seed: number): number {
  // Integer hash.
  const hash = (n: number) => {
    let h = Math.floor(n) + seed * 374761393;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) >>> 0;
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  // Four corner hashes → [0,1]
  const n00 = (hash(ix + iy * 50123) % 1024) / 1024;
  const n10 = (hash(ix + 1 + iy * 50123) % 1024) / 1024;
  const n01 = (hash(ix + (iy + 1) * 50123) % 1024) / 1024;
  const n11 = (hash(ix + 1 + (iy + 1) * 50123) % 1024) / 1024;

  // Smoothstep interpolation.
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

/** FBM (fractal Brownian motion) for richer terrain. */
function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, y * frequency, seed + i * 97);
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / max;
}

/** Generate a TileMap covering the given world bounds. */
export function generateTileMap(opts: {
  width: number;
  height: number;
  tileSize?: number;
  seed?: number;
  waterLevel?: number;
  sandLevel?: number;
  rockLevel?: number;
}): TileMap {
  const {
    width,
    height,
    tileSize = 32,
    seed = 42,
    waterLevel = 0.35,
    sandLevel = 0.55,
    rockLevel = 0.78,
  } = opts;

  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const tiles = new Uint8Array(cols * rows);

  // Scale factors to create interesting island-like features.
  const scaleX = 4 / cols;
  const scaleY = 4 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Normalise coords to [0,1] for radial mask.
      const nx = c / cols;
      const ny = r / rows;

      // Centre-bias: lower in the middle, higher at edges (island shape).
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy) * 1.6;

      // FBM terrain height.
      const noise = fbm(c * scaleX, r * scaleY, seed, 5);

      // Combine: high dist pushes toward deep water; low dist toward land.
      let heightValue = noise * 0.7 + (1 - dist) * 0.3;

      // Slight ridge noise for detail.
      const detail = fbm(c * scaleX * 3, r * scaleY * 3, seed + 50, 3) * 0.1;
      heightValue += detail;

      // Clamp and classify.
      heightValue = Math.max(0, Math.min(1, heightValue));

      let type: TileType;
      if (heightValue < waterLevel) {
        type = TileType.DeepWater;
      } else if (heightValue < sandLevel) {
        type = TileType.ShallowWater;
      } else if (heightValue < rockLevel) {
        type = TileType.Sand;
      } else {
        // Coral is rare: only the very tops of rocky areas.
        type = heightValue > 0.92 ? TileType.Coral : TileType.Rock;
      }

      tiles[r * cols + c] = type;
    }
  }

  // Post-process: smooth isolated tiles (single-tile anomalies).
  smoothIsolated(tiles, cols, rows);

  return { cols, rows, tileSize, tiles };
}

/** Replace lone tiles surrounded by different types with the majority neighbour. */
function smoothIsolated(tiles: Uint8Array, cols: number, rows: number): void {
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const idx = r * cols + c;
      const self = tiles[idx];
      // Count 8-neighbour frequencies.
      const counts = new Map<TileType, number>();
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const n = tiles[(r + dr) * cols + (c + dc)] as TileType;
          counts.set(n, (counts.get(n) ?? 0) + 1);
        }
      }
      // If this tile is different from all 8 neighbours, flip to majority.
      let majority = self;
      let maxCount = 0;
      for (const [type, count] of counts) {
        if (count > maxCount) {
          maxCount = count;
          majority = type;
        }
      }
      if (maxCount >= 7 && majority !== self) {
        tiles[idx] = majority;
      }
    }
  }
}

/** Look up the tile at a world pixel coordinate. */
export function tileAt(map: TileMap, x: number, y: number): TileType | undefined {
  const c = Math.floor(x / map.tileSize);
  const r = Math.floor(y / map.tileSize);
  if (c < 0 || c >= map.cols || r < 0 || r >= map.rows) return undefined;
  return map.tiles[r * map.cols + c] as TileType;
}

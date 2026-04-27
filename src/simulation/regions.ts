// Regions divide the world into named rectangles. The active region is the
// one containing the player. Only entities inside the active region tick —
// elsewhere, NPCs are frozen until the player enters their region. This is
// Shape A of the map architecture: one World, region-gated simulation.

export type RegionBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Region = {
  id: string;
  name: string;
  bounds: RegionBounds;
};

export function findRegion(regions: readonly Region[], x: number, y: number): Region | null {
  for (const r of regions) {
    const b = r.bounds;
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return r;
  }
  return null;
}

export function getRegion(regions: readonly Region[], id: string | null): Region | null {
  if (!id) return null;
  for (const r of regions) if (r.id === id) return r;
  return null;
}

// Decoration types for static world objects (trees, rocks, buildings, flags,
// smoke) and ambient idle objects. These live in the simulation layer so
// collision queries can see them, and are exported as snapshots for the
// renderer to draw.

export type DecorationKind = "tree" | "rock" | "signpost" | "flag" | "smoke" | "building";

/** Full decoration record stored in the World. */
export type Decoration = {
  id: string;
  kind: DecorationKind;
  /** Visual variant index 0–3 for texture variety. */
  variant: number;
  x: number;
  y: number;
  /** Width of the collision / render bounding box. */
  width: number;
  /** Height of the collision / render bounding box. */
  height: number;
  /** True for buildings, rocks, trees — things that block movement. */
  isCollidable: boolean;
  /** Phase offset for ambient animations (flags, smoke). 0–1. */
  animPhase: number;
};

/** Lightweight decoration data sent to the renderer each frame. */
export type DecorationSnapshot = {
  id: string;
  kind: DecorationKind;
  variant: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isCollidable: boolean;
  animPhase: number;
};

export function toDecorationSnapshot(d: Decoration): DecorationSnapshot {
  return {
    id: d.id,
    kind: d.kind,
    variant: d.variant,
    x: d.x,
    y: d.y,
    width: d.width,
    height: d.height,
    isCollidable: d.isCollidable,
    animPhase: d.animPhase,
  };
}

let decorationCounter = 0;

export function resetDecorationCounter(): void {
  decorationCounter = 0;
}

export function nextDecorationId(): string {
  return `d${(++decorationCounter).toString(36)}`;
}

export const DECORATION_SIZES: Record<DecorationKind, { width: number; height: number }> = {
  tree: { width: 20, height: 24 },
  rock: { width: 18, height: 14 },
  signpost: { width: 10, height: 16 },
  flag: { width: 8, height: 20 },
  smoke: { width: 14, height: 14 },
  building: { width: 56, height: 56 },
};

/** True when the decoration kind should block entity movement. */
export function isDecorCollidable(kind: DecorationKind): boolean {
  return kind === "building" || kind === "tree" || kind === "rock";
}

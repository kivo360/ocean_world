import { Assets, Rectangle, Texture } from "pixi.js";

export interface AnimationSpec {
  row: number;
  frames: number;
  loop: boolean;
  frameDurationMs: number;
}

export interface AtlasManifest {
  version: number;
  atlasFile: string;
  atlasWidth: number;
  atlasHeight: number;
  layout: {
    frameWidth: number;
    frameHeight: number;
    animations: Record<string, AnimationSpec>;
  };
  characters: Array<{
    id: string;
    x: number;
    y: number;
    sheetWidth: number;
    sheetHeight: number;
  }>;
}

/**
 * Loaded atlas: holds the base texture and lazily slices per-frame sub-textures
 * so each frame swap is just a `sprite.texture = ...` reassignment.
 *
 * Usage:
 *   const atlas = await SpriteAtlas.load("/sprites/atlas.png", "/sprites/manifest.json");
 *   const tex = atlas.frameTexture("Player", "walk-s", 2);
 *   sprite.texture = tex;
 */
export class SpriteAtlas {
  private cache = new Map<string, Texture>();

  private constructor(private base: Texture, public manifest: AtlasManifest) {}

  static async load(atlasUrl: string, manifestUrl: string): Promise<SpriteAtlas> {
    const [baseTex, manifestRes] = await Promise.all([
      Assets.load<Texture>(atlasUrl),
      fetch(manifestUrl),
    ]);
    if (!manifestRes.ok) {
      throw new Error(`atlas manifest fetch failed: ${manifestRes.status} ${manifestUrl}`);
    }
    const manifest = (await manifestRes.json()) as AtlasManifest;
    // Pixel art: nearest-neighbour upscale, no smoothing.
    if ("scaleMode" in baseTex.source) {
      (baseTex.source as { scaleMode: string }).scaleMode = "nearest";
    }
    return new SpriteAtlas(baseTex, manifest);
  }

  hasCharacter(id: string): boolean {
    return this.manifest.characters.some((c) => c.id === id);
  }

  hasAnimation(name: string): boolean {
    return name in this.manifest.layout.animations;
  }

  animation(name: string): AnimationSpec | null {
    return this.manifest.layout.animations[name] ?? null;
  }

  frameTexture(charId: string, animName: string, frameIdx: number): Texture | null {
    const ch = this.manifest.characters.find((c) => c.id === charId);
    if (!ch) return null;
    const anim = this.manifest.layout.animations[animName];
    if (!anim) return null;

    const frame = ((frameIdx % anim.frames) + anim.frames) % anim.frames;
    const key = `${charId}|${animName}|${frame}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const fw = this.manifest.layout.frameWidth;
    const fh = this.manifest.layout.frameHeight;
    const tex = new Texture({
      source: this.base.source,
      frame: new Rectangle(ch.x + frame * fw, ch.y + anim.row * fh, fw, fh),
    });
    this.cache.set(key, tex);
    return tex;
  }

  /** FNV-1a 32-bit hash for deterministic variant selection. */
  private hashToInt(id: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Returns all character IDs that match exactly or start with `${archetype}:`. */
  variantIdsFor(archetype: string): string[] {
    return this.manifest.characters
      .map((c) => c.id)
      .filter((id) => id === archetype || id.startsWith(`${archetype}:`));
  }

  /**
   * Resolves a concrete character ID for an entity, deterministically picking
   * from available variants using the entity ID as a hash seed.
   * Returns null if no variants exist for the archetype.
   */
  resolveCharacterId(archetype: string, entityId: string): string | null {
    const variants = this.variantIdsFor(archetype);
    if (variants.length === 0) return null;
    return variants[this.hashToInt(entityId) % variants.length] ?? null;
  }
}

/**
 * Picks a walk-direction animation from a movement delta. Returns "idle" when
 * the entity hasn't moved meaningfully since the last sample. Dominant axis
 * wins, so diagonals snap to the larger component (matching most LPC games).
 *
 * With hysteresis: if `current` is provided and is a walk animation, the
 * current direction is kept unless the other axis is clearly dominant
 * (exceeds flipRatio). This prevents strobing when walking at 45°.
 */
export function pickAnimation(
  dx: number,
  dy: number,
  current?: string,
  threshold = 0.5,
  flipRatio = 1.5
): string {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < threshold && ay < threshold) return "idle";

  // No hysteresis if no current animation or currently idle
  if (!current || current === "idle") {
    if (ax >= ay) return dx > 0 ? "walk-e" : "walk-w";
    return dy > 0 ? "walk-s" : "walk-n";
  }

  // Hysteresis: stay on current direction unless other axis is clearly dominant
  const isHorizontal = current === "walk-e" || current === "walk-w";
  const isVertical = current === "walk-n" || current === "walk-s";

  if (isHorizontal) {
    // Stay horizontal unless vertical is clearly dominant
    if (ay > ax * flipRatio) {
      return dy > 0 ? "walk-s" : "walk-n";
    }
    return dx > 0 ? "walk-e" : "walk-w";
  }

  if (isVertical) {
    // Stay vertical unless horizontal is clearly dominant
    if (ax > ay * flipRatio) {
      return dx > 0 ? "walk-e" : "walk-w";
    }
    return dy > 0 ? "walk-s" : "walk-n";
  }

  // Current is some other animation, fall back to dominant axis
  if (ax >= ay) return dx > 0 ? "walk-e" : "walk-w";
  return dy > 0 ? "walk-s" : "walk-n";
}

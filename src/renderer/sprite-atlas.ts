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
}

/**
 * Picks a walk-direction animation from a movement delta. Returns "idle" when
 * the entity hasn't moved meaningfully since the last sample. Dominant axis
 * wins, so diagonals snap to the larger component (matching most LPC games).
 */
export function pickAnimation(dx: number, dy: number, threshold = 0.5): string {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < threshold && ay < threshold) return "idle";
  if (ax >= ay) return dx > 0 ? "walk-e" : "walk-w";
  return dy > 0 ? "walk-s" : "walk-n";
}

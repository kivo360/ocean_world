/**
 * Two ways to describe a character:
 *
 * 1. `layers`: explicit list of file paths (relative to --lpc-assets), composited
 *    bottom-to-top. Use this with real LPC art where filenames don't follow a
 *    simple {category}/{variant}/{color}.png pattern.
 *
 * 2. The category-based fields (body/hair/clothing/accessories): the resolver
 *    constructs paths like `body/{base}/{skinTone}.png`. Use this with the
 *    synthetic fixtures or any tree that follows the same convention.
 *
 * `layers` wins when both are provided.
 */
export interface CharacterConfig {
  id: string;
  layers?: string[];
  body?: { base: string; skinTone: string };
  hair?: { style: string; color: string } | null;
  clothing?: {
    shirt: string;
    pants: string;
    shoes: string;
  };
  accessories?: {
    hat?: string | null;
    glasses?: string | null;
    cape?: string | null;
  };
  palette?: {
    shirtColor?: string;
    pantsColor?: string;
  };
}

export interface CharactersFile {
  characters: CharacterConfig[];
}

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

export const MANIFEST_VERSION = 3;

export function defaultAnimations(): Record<string, AnimationSpec> {
  return {
    idle: { row: 0, frames: 2, loop: true, frameDurationMs: 400 },
    'walk-e': { row: 1, frames: 4, loop: true, frameDurationMs: 150 },
    'walk-s': { row: 2, frames: 4, loop: true, frameDurationMs: 150 },
    'walk-w': { row: 3, frames: 4, loop: true, frameDurationMs: 150 },
    'walk-n': { row: 4, frames: 4, loop: true, frameDurationMs: 150 },
  };
}

import sharp, { type OverlayOptions } from 'sharp';
import { cpus } from 'node:os';
import { readFile } from 'node:fs/promises';
import type { CharacterConfig } from './manifest.js';
import { resolveLayerPaths, type LayerCategory, type ResolvedLayer } from './config.js';
import { applyPaletteSwap, hexToRgb, rgbToHsl } from './palette.js';
import { cropWalkCycle } from './crop.js';
import { Cache, computeCacheKey } from './cache.js';

export interface ComposeOptions {
  lpcDir: string;
  cropToWalkCycle: boolean;
  srcFrameSize: number;
  outputFrameSize: number;
}

export interface ComposeContext {
  options: ComposeOptions;
  cache: Cache;
}

export async function composeCharacter(
  config: CharacterConfig,
  ctx: ComposeContext,
): Promise<Buffer> {
  const layers = resolveLayerPaths(config, ctx.options.lpcDir);
  if (layers.length === 0) {
    throw new Error(`No layers resolved for character ${config.id}`);
  }

  // Cache key is derived from layer file content + crop options + palette.
  // We deliberately do NOT include the character's id — two characters with
  // identical layers and palette resolve to the same composed sprite, so we'd
  // rather hit the cache than rebuild.
  const cacheKey = await computeCacheKey({
    tag: 'compose',
    files: layers.map((l) => l.path),
    options: {
      crop: {
        cropToWalkCycle: ctx.options.cropToWalkCycle,
        srcFrameSize: ctx.options.srcFrameSize,
        outputFrameSize: ctx.options.outputFrameSize,
      },
      palette: config.palette ?? null,
      // category-of-layer matters for palette decisions
      categories: layers.map((l) => l.category),
    },
  });

  const cached = await ctx.cache.getBuffer(cacheKey, 'png');
  if (cached) return cached;

  const composed = await composeFromLayers(config, layers, ctx.options);
  await ctx.cache.putBuffer(cacheKey, 'png', composed);
  return composed;
}

async function composeFromLayers(
  config: CharacterConfig,
  layers: ResolvedLayer[],
  options: ComposeOptions,
): Promise<Buffer> {
  const baseLayer = layers[0]!;
  const baseImg = sharp(await readFile(baseLayer.path));
  const baseMeta = await baseImg.metadata();
  if (!baseMeta.width || !baseMeta.height) {
    throw new Error(`Cannot read base-layer dimensions: ${baseLayer.path}`);
  }
  const baseWidth = baseMeta.width;
  const baseHeight = baseMeta.height;

  const overlays: OverlayOptions[] = [];
  for (let i = 1; i < layers.length; i++) {
    const layer = layers[i]!;
    let buf: Buffer<ArrayBufferLike> = await readFile(layer.path);

    const layerMeta = await sharp(buf).metadata();
    if (layerMeta.width !== baseWidth || layerMeta.height !== baseHeight) {
      console.warn(
        `[${config.id}] dimension mismatch on ${layer.category} (${layerMeta.width}x${layerMeta.height} vs base ${baseWidth}x${baseHeight}) — skipping layer`,
      );
      continue;
    }

    if (config.palette) {
      buf = await maybeApplyPalette(buf, layer.category, config.palette);
    }
    overlays.push({ input: buf, top: 0, left: 0, blend: 'over' });
  }

  let composed = await baseImg.composite(overlays).png().toBuffer();

  if (options.cropToWalkCycle) {
    composed = await cropWalkCycle(composed, {
      srcFrameSize: options.srcFrameSize,
      outputFrameSize: options.outputFrameSize,
    });
  }

  return composed;
}

async function maybeApplyPalette(
  buf: Buffer<ArrayBufferLike>,
  category: LayerCategory,
  palette: NonNullable<CharacterConfig['palette']>,
): Promise<Buffer<ArrayBufferLike>> {
  const targetHex =
    category === 'shirt' ? palette.shirtColor : category === 'pants' ? palette.pantsColor : undefined;
  if (!targetHex) return buf;

  const [r, g, b] = hexToRgb(targetHex);
  const [targetHue] = rgbToHsl(r, g, b);

  // The Universal-LPC base shirt/pants assets ship as a single hue-tinted variant
  // (white.png / teal.png in our resolver). Sweeping the full hue circle lets us
  // re-tint regardless of which placeholder color the user picked, while the
  // saturation gate inside applyPaletteSwap leaves greys/skin alone.
  return applyPaletteSwap(buf, [0, 360], targetHue);
}

export async function composeAll(
  configs: CharacterConfig[],
  ctx: ComposeContext,
): Promise<{ results: Map<string, Buffer>; failures: Array<{ id: string; error: string }> }> {
  const concurrency = Math.max(1, cpus().length - 1);
  const results = new Map<string, Buffer>();
  const failures: Array<{ id: string; error: string }> = [];

  for (let i = 0; i < configs.length; i += concurrency) {
    const batch = configs.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async (config) => {
        const buffer = await composeCharacter(config, ctx);
        return [config.id, buffer] as const;
      }),
    );
    for (let j = 0; j < settled.length; j++) {
      const result = settled[j]!;
      const config = batch[j]!;
      if (result.status === 'fulfilled') {
        results.set(result.value[0], result.value[1]);
      } else {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`FAILED: ${config.id} — ${message}`);
        failures.push({ id: config.id, error: message });
      }
    }
  }

  return { results, failures };
}

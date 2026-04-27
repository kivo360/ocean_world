import sharp, { type OverlayOptions } from 'sharp';
import { MaxRectsPacker } from 'maxrects-packer';
import { glob } from 'glob';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { defaultAnimations, MANIFEST_VERSION, type AtlasManifest } from './manifest.js';
import { Cache, computeCacheKey } from './cache.js';

export interface PackOptions {
  inputDir: string;
  outputDir: string;
  maxAtlasSize: number;
  padding: number;
  outputFrameSize: number;
}

export interface PackContext {
  options: PackOptions;
  cache: Cache;
}

interface SheetEntry {
  id: string;
  buffer: Buffer;
  width: number;
  height: number;
  path: string;
}

export async function packAtlas(ctx: PackContext): Promise<AtlasManifest> {
  const { options } = ctx;
  const sheets = await loadSheets(options.inputDir);
  if (sheets.length === 0) {
    throw new Error(`No PNGs found in ${options.inputDir}`);
  }

  const cacheKey = await computeCacheKey({
    tag: 'atlas',
    files: sheets.map((s) => s.path),
    options: {
      maxAtlasSize: options.maxAtlasSize,
      padding: options.padding,
      outputFrameSize: options.outputFrameSize,
      // Sheet ids participate so we invalidate when a character is renamed.
      ids: sheets.map((s) => s.id),
    },
  });

  const cached = await ctx.cache.getPaired<AtlasManifest>(cacheKey, 'png');
  if (cached) {
    await writeFile(join(options.outputDir, cached.meta.atlasFile), cached.buffer);
    await writeFile(
      join(options.outputDir, 'manifest.json'),
      JSON.stringify(cached.meta, null, 2) + '\n',
    );
    return cached.meta;
  }

  const bin = await packWithAutoGrow(sheets, options.maxAtlasSize, options.padding);

  const overlays: OverlayOptions[] = bin.rects.map((rect) => ({
    input: (rect.data as { buffer: Buffer }).buffer,
    top: rect.y,
    left: rect.x,
  }));

  const atlasFile = 'atlas.png';
  const atlasBuffer = await sharp({
    create: {
      width: bin.width,
      height: bin.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();

  await writeFile(join(options.outputDir, atlasFile), atlasBuffer);

  const manifest: AtlasManifest = {
    version: MANIFEST_VERSION,
    atlasFile,
    atlasWidth: bin.width,
    atlasHeight: bin.height,
    layout: {
      frameWidth: options.outputFrameSize,
      frameHeight: options.outputFrameSize,
      animations: defaultAnimations(),
    },
    characters: bin.rects
      .map((rect) => ({
        id: (rect.data as { id: string }).id,
        x: rect.x,
        y: rect.y,
        sheetWidth: rect.width,
        sheetHeight: rect.height,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };

  await writeFile(
    join(options.outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  await ctx.cache.putPaired(cacheKey, 'png', atlasBuffer, manifest);
  return manifest;
}

interface PackedBin {
  width: number;
  height: number;
  rects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    data: { id: string; buffer: Buffer };
  }>;
}

async function packWithAutoGrow(
  sheets: SheetEntry[],
  maxAtlasSize: number,
  padding: number,
): Promise<PackedBin> {
  const sumArea = sheets.reduce((acc, s) => acc + s.width * s.height, 0);
  let size = nextPow2(Math.max(64, Math.ceil(Math.sqrt(sumArea))));
  const cap = nextPow2(maxAtlasSize);

  let lastBinCount = 0;
  while (size <= cap) {
    const packer = new MaxRectsPacker(size, size, padding, {
      smart: true,
      pot: true,
      square: false,
      allowRotation: false,
    });
    for (const s of sheets) {
      packer.add(s.width, s.height, { id: s.id, buffer: s.buffer });
    }
    if (packer.bins.length === 1) {
      const bin = packer.bins[0]!;
      return {
        width: bin.width,
        height: bin.height,
        rects: bin.rects.map((r) => ({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          data: r.data as { id: string; buffer: Buffer },
        })),
      };
    }
    lastBinCount = packer.bins.length;
    size *= 2;
  }
  throw new Error(
    `Atlas overflow: ${sheets.length} sprites do not fit in ${cap}x${cap} (would need ${lastBinCount} bins). Increase --max-atlas-size or split your input.`,
  );
}

function nextPow2(n: number): number {
  let v = 1;
  while (v < n) v <<= 1;
  return v;
}

async function loadSheets(inputDir: string): Promise<SheetEntry[]> {
  const paths = await glob('*.png', { cwd: inputDir, absolute: true });
  paths.sort();
  const sheets: SheetEntry[] = [];

  for (const path of paths) {
    const buffer = await readFile(path);
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) {
      console.warn(`Skipping ${path}: cannot read dimensions`);
      continue;
    }
    sheets.push({
      id: basename(path, extname(path)),
      buffer,
      width: meta.width,
      height: meta.height,
      path,
    });
  }
  return sheets;
}

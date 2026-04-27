/**
 * Generates synthetic LPC-shaped fixture PNGs at the standard 832x1344 size
 * (13 cols × 21 rows of 64-pixel frames). Each fixture is a flat color so
 * compositing can be eyeballed and dimension/positioning bugs surface fast.
 *
 * Usage: npm run fixtures
 * Output: ./fixtures/lpc/{category}/{variant}/{color}.png
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

const SHEET_W = 832;
const SHEET_H = 1344;
const FRAME = 64;

interface Fixture {
  category: string;
  variant: string;
  color: string;
  rgb: { r: number; g: number; b: number };
  // Region within a single frame to fill (top, left, w, h relative to frame origin)
  region: { top: number; left: number; w: number; h: number };
}

const FIXTURES: Fixture[] = [
  // body — covers most of the frame
  { category: 'body', variant: 'male', color: 'light', rgb: { r: 235, g: 196, b: 156 }, region: { top: 8, left: 16, w: 32, h: 56 } },
  { category: 'body', variant: 'female', color: 'tanned', rgb: { r: 199, g: 156, b: 110 }, region: { top: 8, left: 16, w: 32, h: 56 } },

  // hair — top of head only
  { category: 'hair', variant: 'bangs', color: 'brunette', rgb: { r: 90, g: 60, b: 30 }, region: { top: 4, left: 18, w: 28, h: 16 } },
  { category: 'hair', variant: 'messy1', color: 'blonde', rgb: { r: 220, g: 190, b: 100 }, region: { top: 4, left: 18, w: 28, h: 16 } },
  { category: 'hair', variant: 'ponytail', color: 'raven', rgb: { r: 30, g: 30, b: 35 }, region: { top: 4, left: 18, w: 28, h: 18 } },

  // torso — chest area, base color (white-ish so palette swaps are visible)
  { category: 'torso', variant: 'longsleeve', color: 'white', rgb: { r: 235, g: 235, b: 235 }, region: { top: 22, left: 18, w: 28, h: 18 } },
  { category: 'torso', variant: 'shortsleeve', color: 'white', rgb: { r: 235, g: 235, b: 235 }, region: { top: 22, left: 20, w: 24, h: 16 } },

  // legs — lower body
  { category: 'legs', variant: 'pants', color: 'teal', rgb: { r: 60, g: 130, b: 130 }, region: { top: 40, left: 22, w: 20, h: 18 } },

  // feet — bottom strip
  { category: 'feet', variant: 'boots', color: 'brown', rgb: { r: 70, g: 45, b: 25 }, region: { top: 56, left: 22, w: 20, h: 6 } },
  { category: 'feet', variant: 'shoes', color: 'brown', rgb: { r: 100, g: 70, b: 40 }, region: { top: 58, left: 22, w: 20, h: 4 } },

  // glasses — small accessory
  { category: 'glasses', variant: 'round', color: 'black', rgb: { r: 20, g: 20, b: 20 }, region: { top: 14, left: 22, w: 20, h: 4 } },
];

async function generateOne(f: Fixture, outRoot: string): Promise<void> {
  const fileDir = join(outRoot, f.category, f.variant);
  await mkdir(fileDir, { recursive: true });
  const filePath = join(fileDir, `${f.color}.png`);

  // Tile the region across every frame in the sheet so all rows/columns
  // (i.e. all animations and directions) look populated.
  const stamp = await sharp({
    create: {
      width: f.region.w,
      height: f.region.h,
      channels: 4,
      background: { ...f.rgb, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const overlays: sharp.OverlayOptions[] = [];
  for (let row = 0; row < SHEET_H / FRAME; row++) {
    for (let col = 0; col < SHEET_W / FRAME; col++) {
      overlays.push({
        input: stamp,
        top: row * FRAME + f.region.top,
        left: col * FRAME + f.region.left,
      });
    }
  }

  await sharp({
    create: {
      width: SHEET_W,
      height: SHEET_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toFile(filePath);

  console.log(`  wrote ${filePath}`);
}

async function main(): Promise<void> {
  const outRoot = join(ROOT, 'fixtures', 'lpc');
  console.log(`Generating ${FIXTURES.length} fixture sheets (${SHEET_W}x${SHEET_H}) -> ${outRoot}`);
  for (const f of FIXTURES) {
    await generateOne(f, outRoot);
  }
  console.log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

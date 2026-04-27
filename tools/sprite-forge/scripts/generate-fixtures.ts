/**
 * Generates synthetic LPC-shaped fixture PNGs at the standard 832x1344 size
 * (13 cols × 21 rows of 64-pixel frames). Each fixture is a flat color so
 * compositing can be eyeballed and dimension/positioning bugs surface fast.
 *
 * Usage: npm run fixtures
 * Output: ./fixtures/lpc-real/{category}/{variant}/{color}.png
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
  relPath: string;
  rgb: { r: number; g: number; b: number };
  region: { top: number; left: number; w: number; h: number };
}

function fixture(
  relPath: string,
  rgb: { r: number; g: number; b: number },
  region: { top: number; left: number; w: number; h: number },
): Fixture {
  return { relPath, rgb, region };
}

const FIXTURES: Fixture[] = [
  fixture('body/male/light.png',            { r: 235, g: 196, b: 156 }, { top: 8,  left: 16, w: 32, h: 56 }),
  fixture('body/male/dark.png',             { r: 120, g: 80,  b: 50  }, { top: 8,  left: 16, w: 32, h: 56 }),
  fixture('body/female/tanned.png',         { r: 199, g: 156, b: 110 }, { top: 8,  left: 16, w: 32, h: 56 }),

  fixture('hair/male/bangs/brunette.png',   { r: 90,  g: 60,  b: 30  }, { top: 4,  left: 18, w: 28, h: 16 }),
  fixture('hair/male/ponytail/raven.png',   { r: 30,  g: 30,  b: 35  }, { top: 4,  left: 18, w: 28, h: 18 }),
  fixture('hair/male/long/raven.png',       { r: 30,  g: 30,  b: 35  }, { top: 4,  left: 18, w: 28, h: 20 }),
  fixture('hair/male/long/blonde.png',      { r: 220, g: 190, b: 100 }, { top: 4,  left: 18, w: 28, h: 20 }),
  fixture('hair/male/bedhead/blonde.png',   { r: 220, g: 190, b: 100 }, { top: 4,  left: 18, w: 28, h: 16 }),
  fixture('hair/male/bunches/brown.png',    { r: 120, g: 80,  b: 40  }, { top: 4,  left: 18, w: 28, h: 16 }),
  fixture('hair/male/messy1/blonde.png',    { r: 220, g: 190, b: 100 }, { top: 4,  left: 18, w: 28, h: 16 }),

  fixture('torso/shirts/longsleeve/male/white_longsleeve.png',   { r: 210, g: 210, b: 235 }, { top: 22, left: 18, w: 28, h: 18 }),
  fixture('torso/shirts/longsleeve/male/maroon_longsleeve.png',  { r: 160, g: 30,  b: 60  }, { top: 22, left: 18, w: 28, h: 18 }),
  fixture('torso/shirts/longsleeve/male/teal_longsleeve.png',    { r: 30,  g: 150, b: 150 }, { top: 22, left: 18, w: 28, h: 18 }),

  fixture('torso/chain/mail_male.png',                           { r: 160, g: 160, b: 170 }, { top: 22, left: 18, w: 28, h: 20 }),

  fixture('legs/pants/male/teal_pants_male.png',   { r: 30,  g: 130, b: 130 }, { top: 40, left: 22, w: 20, h: 18 }),
  fixture('legs/pants/male/red_pants_male.png',    { r: 180, g: 30,  b: 30  }, { top: 40, left: 22, w: 20, h: 18 }),
  fixture('legs/pants/male/white_pants_male.png',  { r: 220, g: 220, b: 235 }, { top: 40, left: 22, w: 20, h: 18 }),
  fixture('legs/pants/male/maroon_pants_male.png', { r: 140, g: 30,  b: 60  }, { top: 40, left: 22, w: 20, h: 18 }),

  fixture('feet/shoes/male/brown_shoes_male.png',  { r: 100, g: 70,  b: 40  }, { top: 58, left: 22, w: 20, h: 4 }),
  fixture('feet/shoes/male/maroon_shoes_male.png', { r: 140, g: 30,  b: 50  }, { top: 58, left: 22, w: 20, h: 4 }),
  fixture('feet/shoes/male/black_shoes_male.png',  { r: 25,  g: 25,  b: 25  }, { top: 58, left: 22, w: 20, h: 4 }),

  fixture('head/caps/male/leather_cap_male.png',   { r: 140, g: 100, b: 60  }, { top: 2,  left: 18, w: 28, h: 8 }),
  fixture('head/hoods/male/cloth_hood_male.png',   { r: 80,  g: 70,  b: 60  }, { top: 2,  left: 18, w: 28, h: 14 }),
  fixture('head/helms/male/golden_helm_male.png',  { r: 220, g: 180, b: 60  }, { top: 2,  left: 18, w: 28, h: 10 }),
];

async function generateOne(f: Fixture, outRoot: string): Promise<void> {
  const filePath = join(outRoot, f.relPath);
  await mkdir(dirname(filePath), { recursive: true });

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
  const outRoot = join(ROOT, 'fixtures', 'lpc-real');
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

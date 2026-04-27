/**
 * Builds an inspection contact sheet showing every layer fixture's
 * walk-south strip plus the full-stack composite, all stacked vertically.
 * Output: out/inspect/contact-sheet.png and out/inspect/composite-full.png
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');
const LPC = join(ROOT, 'fixtures', 'lpc');

const FIXTURES: string[] = [
  'body/male/light.png',
  'body/female/tanned.png',
  'hair/bangs/brunette.png',
  'hair/messy1/blonde.png',
  'hair/ponytail/raven.png',
  'torso/longsleeve/white.png',
  'torso/shortsleeve/white.png',
  'legs/pants/teal.png',
  'feet/boots/brown.png',
  'feet/shoes/brown.png',
  'glasses/round/black.png',
];

// LPC walk-south = row 10. Frame 0 is rest pose; we skip it and grab frames 1..4.
const FRAME = 64;
const WALK_S_ROW = 10;
const STEP_START = 1;
const STEP_COUNT = 4;
const STRIP_W = STEP_COUNT * FRAME; // 256
const STRIP_H = FRAME;              // 64

async function main(): Promise<void> {
  await mkdir(join(ROOT, 'out', 'inspect'), { recursive: true });

  const walkSRegion = {
    left: STEP_START * FRAME,
    top: WALK_S_ROW * FRAME,
    width: STRIP_W,
    height: STRIP_H,
  };

  const layerStrips: Array<{ name: string; buf: Buffer }> = [];
  for (const f of FIXTURES) {
    const buf = await sharp(join(LPC, f)).extract(walkSRegion).png().toBuffer();
    layerStrips.push({ name: f, buf });
  }

  // Stack all layers — body first, then hair, then clothing, then accessories.
  const composeOrder = [
    'body/male/light.png',
    'hair/bangs/brunette.png',
    'torso/longsleeve/white.png',
    'legs/pants/teal.png',
    'feet/boots/brown.png',
    'glasses/round/black.png',
  ];
  const baseComposite = sharp(join(LPC, composeOrder[0]!));
  const overlayInputs: sharp.OverlayOptions[] = composeOrder
    .slice(1)
    .map((p) => ({ input: join(LPC, p), top: 0, left: 0 }));
  const compositeFull = await baseComposite.composite(overlayInputs).png().toBuffer();
  const compositeStrip = await sharp(compositeFull).extract(walkSRegion).png().toBuffer();

  await sharp(compositeFull).toFile(join(ROOT, 'out', 'inspect', 'composite-full.png'));

  const allStrips = [
    ...layerStrips,
    { name: '__COMPOSITE__', buf: compositeStrip },
  ];

  const sep = 2;
  const sheetH = (STRIP_H + sep) * allStrips.length - sep;
  const sheetOverlays: sharp.OverlayOptions[] = allStrips.map((s, i) => ({
    input: s.buf,
    top: i * (STRIP_H + sep),
    left: 0,
  }));

  await sharp({
    create: {
      width: STRIP_W,
      height: sheetH,
      channels: 4,
      background: { r: 60, g: 60, b: 60, alpha: 1 },
    },
  })
    .composite(sheetOverlays)
    .png()
    .toFile(join(ROOT, 'out', 'inspect', 'contact-sheet.png'));

  console.log(`Wrote out/inspect/contact-sheet.png (${STRIP_W}x${sheetH}, ${allStrips.length} strips)`);
  console.log(`Wrote out/inspect/composite-full.png`);
  console.log('Layer order in contact sheet:');
  for (let i = 0; i < allStrips.length; i++) {
    console.log(`  ${i}: ${allStrips[i]!.name}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

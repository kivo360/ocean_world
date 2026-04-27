# sprite-forge

LPC sprite compositing and texture-atlas packing CLI for ocean-world.

Replaces the AI image generation pipeline with deterministic layer compositing:
body + hair + clothes + accessories = pixel-perfect sprite sheets at $0 cost,
sub-100 ms per character.

## Layout

```
src/
  cli.ts        CLI entry (commander), dispatches to compose/pack
  config.ts     Parse characters.json, resolve layer paths
  compose.ts    Layer compositing with sharp
  crop.ts       Extract walk-cycle subset from full LPC sheets
  pack.ts      Atlas packing with maxrects-packer
  manifest.ts  Types + manifest.json shape
  palette.ts   HSL color math for palette swapping
examples/
  characters.json  Sample character configs
scripts/
  generate-fixtures.ts  Synthesize fake LPC sheets for testing
  smoke-test.ts         End-to-end sanity check
```

## Install

```sh
cd tools/sprite-forge
npm install
```

## Usage (against real LPC assets)

```sh
# 1. Compose
npx tsx src/cli.ts compose \
  --config examples/characters.json \
  --lpc-assets /path/to/lpc/ \
  --output ./out/composed/

# 2. Pack
npx tsx src/cli.ts pack \
  --input ./out/composed/ \
  --output ./out/dist/
```

After `npm run build` the same commands work as `node dist/cli.js …` or
`npx sprite-forge …` if linked.

## Smoke test (no LPC assets needed)

```sh
npm run fixtures   # synthesize fake LPC sheets in ./fixtures/lpc/
npm run smoke      # compose + pack + assert outputs
```

## Manifest shape

```json
{
  "version": 3,
  "atlasFile": "atlas.png",
  "atlasWidth": 512,
  "atlasHeight": 256,
  "layout": {
    "frameWidth": 32,
    "frameHeight": 32,
    "animations": {
      "idle":   { "row": 0, "frames": 2, "loop": true, "frameDurationMs": 400 },
      "walk-e": { "row": 1, "frames": 4, "loop": true, "frameDurationMs": 150 },
      "walk-s": { "row": 2, "frames": 4, "loop": true, "frameDurationMs": 150 },
      "walk-w": { "row": 3, "frames": 4, "loop": true, "frameDurationMs": 150 },
      "walk-n": { "row": 4, "frames": 4, "loop": true, "frameDurationMs": 150 }
    }
  },
  "characters": [
    { "id": "hero-default", "x": 0, "y": 0, "sheetWidth": 128, "sheetHeight": 160 }
  ]
}
```

## LPC layout assumptions

The standard LPC sheet is 832×1344 with 64-pixel frames laid out as:

| Rows  | Animation  | Directions (N,W,S,E) |
|-------|------------|-----------------------|
| 0–3   | spellcast  | 7 frames              |
| 4–7   | thrust     | 8 frames              |
| 8–11  | walk       | 9 frames (frame 0 = idle pose) |
| 12–15 | slash      | 6 frames              |
| 16–19 | shoot      | 13 frames             |
| 20    | hurt       | south only, 6 frames  |

`crop.ts` extracts walk frames 1–4 of each direction (skipping the rest pose at
frame 0) into a compact 4×5 grid at the chosen `--output-frame-size`. The
default 32 px output is suitable for Gather-style top-down rendering; pass
`--no-crop` to keep the full LPC sheet.

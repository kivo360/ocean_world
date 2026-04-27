/**
 * Builds a self-contained HTML preview of the packed atlas: every character
 * in the manifest is rendered animating in idle + 4 walking directions.
 * Atlas + manifest are inlined as base64 so the file works via file:// without
 * needing a static server.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

async function main(): Promise<void> {
  const atlasDir = process.argv[2]
    ? join(process.cwd(), process.argv[2])
    : join(ROOT, 'out', 'real', 'atlas');
  const atlasPng = await readFile(join(atlasDir, 'atlas.png'));
  const manifestText = await readFile(join(atlasDir, 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(manifestText);

  const atlasB64 = atlasPng.toString('base64');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>sprite-forge preview</title>
<style>
  body { background:#1a1d24; color:#d4d4d4; font:13px/1.5 -apple-system, system-ui, sans-serif; margin:0; padding:24px; }
  h1 { margin:0 0 4px; font-size:18px; font-weight:500; }
  .meta { color:#7a7a7a; margin-bottom:18px; font-size:11px; }
  .grid { display:grid; grid-template-columns: 110px repeat(5, 1fr); gap:14px; max-width:920px; }
  .head { color:#7a7a7a; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; padding:6px 0; text-align:center; }
  .label { color:#9ec3e8; padding-top:54px; font-weight:500; }
  .cell { background:#252830; border-radius:6px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:6px; }
  canvas { image-rendering: pixelated; image-rendering: crisp-edges; background:#1a1d24; border-radius:3px; }
  .anim-name { color:#7a7a7a; font-size:10px; text-transform:uppercase; }
</style>
</head>
<body>
  <h1>sprite-forge — real LPC art preview</h1>
  <div class="meta">Atlas: \${atlasW}\xD7\${atlasH} \xB7 \${charCount} characters \xB7 frame size \${fw}\xD7\${fh}px \xB7 rendered at 4\xD7</div>
  <div class="grid" id="grid"></div>
<script>
const MANIFEST = ${JSON.stringify(manifest)};
const ATLAS_DATA_URL = "data:image/png;base64,${atlasB64}";

const SCALE = 4;
const grid = document.getElementById('grid');
const orderedAnims = ['idle', 'walk-e', 'walk-s', 'walk-w', 'walk-n'];

const meta = document.querySelector('.meta');
meta.textContent = "Atlas: " + MANIFEST.atlasWidth + "\\u00D7" + MANIFEST.atlasHeight
  + " \\u00B7 " + MANIFEST.characters.length + " characters"
  + " \\u00B7 frame size " + MANIFEST.layout.frameWidth + "\\u00D7" + MANIFEST.layout.frameHeight + "px"
  + " \\u00B7 rendered at " + SCALE + "\\u00D7";

// Header row
const corner = document.createElement('div');
corner.className = 'head';
grid.appendChild(corner);
for (const a of orderedAnims) {
  const h = document.createElement('div');
  h.className = 'head';
  h.textContent = a;
  grid.appendChild(h);
}

const atlas = new Image();
atlas.src = ATLAS_DATA_URL;
atlas.onload = () => {
  for (const ch of MANIFEST.characters) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = ch.id;
    grid.appendChild(label);

    for (const animName of orderedAnims) {
      const anim = MANIFEST.layout.animations[animName];
      const cell = document.createElement('div');
      cell.className = 'cell';
      const c = document.createElement('canvas');
      c.width = MANIFEST.layout.frameWidth * SCALE;
      c.height = MANIFEST.layout.frameHeight * SCALE;
      cell.appendChild(c);
      const name = document.createElement('div');
      name.className = 'anim-name';
      name.textContent = anim.frames + " fr / " + anim.frameDurationMs + "ms";
      cell.appendChild(name);
      grid.appendChild(cell);
      animate(c, ch, anim);
    }
  }
};

function animate(canvas, char, anim) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const fw = MANIFEST.layout.frameWidth;
  const fh = MANIFEST.layout.frameHeight;
  let frame = 0;
  let last = performance.now();

  function tick(now) {
    if (now - last >= anim.frameDurationMs) {
      frame = (frame + 1) % anim.frames;
      last = now;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      atlas,
      char.x + frame * fw,
      char.y + anim.row * fh,
      fw, fh,
      0, 0,
      fw * SCALE, fh * SCALE,
    );
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
</script>
</body>
</html>`;

  const outPath = join(atlasDir, 'preview.html');
  await writeFile(outPath, html);
  console.log(`Wrote ${outPath} (${html.length} bytes, atlas inlined as base64)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

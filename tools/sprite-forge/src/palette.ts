import sharp from 'sharp';

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, hn + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hn) * 255),
    Math.round(hueToRgb(p, q, hn - 1 / 3) * 255),
  ];
}

function hueToRgb(p: number, q: number, t: number): number {
  let tn = t;
  if (tn < 0) tn += 1;
  if (tn > 1) tn -= 1;
  if (tn < 1 / 6) return p + (q - p) * 6 * tn;
  if (tn < 1 / 2) return q;
  if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
  return p;
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  const expanded = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  if (expanded.length !== 6 || /[^0-9a-fA-F]/.test(expanded)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const n = parseInt(expanded, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Shifts pixels whose hue falls in [sourceHueRange] onto a new hue. The hue
 * offset is preserved within the source range so multi-tone shading on the
 * source layer remains intact.
 */
export async function applyPaletteSwap(
  imageBuffer: Buffer<ArrayBufferLike>,
  sourceHueRange: [number, number],
  targetHue: number,
): Promise<Buffer> {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const [lo, hi] = sourceHueRange;

  for (let i = 0; i < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] === 0) continue;
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.05) continue; // skip neutrals (greys/whites/blacks)
    if (h < lo || h > hi) continue;

    const newH = (targetHue + (h - lo)) % 360;
    const [nr, ng, nb] = hslToRgb(newH, s, l);
    pixels[i] = nr;
    pixels[i + 1] = ng;
    pixels[i + 2] = nb;
  }

  return sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width: info.width, height: info.height, channels: channels as 3 | 4 },
  })
    .png()
    .toBuffer();
}

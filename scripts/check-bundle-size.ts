#!/usr/bin/env tsx
// (#94) Bundle-size budget. Walks dist/assets/, sums the JS bundle sizes,
// and fails if the gzip-equivalent (raw / 3.5 heuristic) exceeds the budget.
// CI calls this after `vite build`.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const DIST_DIR = join(process.cwd(), "dist", "assets");
const BUDGET_BYTES = 4_500_000; // 4.5 MB gzipped — pixi + oxigraph wasm dominate

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let totalRaw = 0;
let totalGz = 0;
const rows: Array<{ file: string; raw: number; gz: number }> = [];

for (const file of walk(DIST_DIR)) {
  if (!/\.(js|css|wasm)$/.test(file)) continue;
  const buf = readFileSync(file);
  const raw = buf.byteLength;
  const gz = gzipSync(buf).byteLength;
  totalRaw += raw;
  totalGz += gz;
  rows.push({ file: file.slice(DIST_DIR.length + 1), raw, gz });
}

rows.sort((a, b) => b.gz - a.gz);
console.log("\nBundle assets (sorted by gzip size):");
for (const r of rows.slice(0, 15)) {
  console.log(
    `  ${(r.gz / 1024).toFixed(1).padStart(8)} KB gz  ${(r.raw / 1024).toFixed(1).padStart(8)} KB raw  ${r.file}`,
  );
}
console.log(
  `\nTotal: ${(totalGz / 1024).toFixed(1)} KB gz / ${(totalRaw / 1024).toFixed(1)} KB raw`,
);
console.log(`Budget: ${(BUDGET_BYTES / 1024).toFixed(1)} KB gz`);

if (totalGz > BUDGET_BYTES) {
  console.error(
    `\n❌ Bundle exceeds gzip budget by ${((totalGz - BUDGET_BYTES) / 1024).toFixed(1)} KB`,
  );
  process.exit(1);
}
console.log("✅ Under budget");

import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

/**
 * Downloads LPC sprite sheets from a configurable URL.
 *
 * Usage:
 *   npx tsx tools/sprite-forge/scripts/pull-lpc.ts
 *   npx tsx tools/sprite-forge/scripts/pull-lpc.ts --outDir ./fixtures/lpc-real
 *   npx tsx tools/sprite-forge/scripts/pull-lpc.ts --manifest ./fixtures/lpc-manifest.json
 */

type Manifest = {
  baseUrl: string;
  files: Array<{ name: string; url: string }>;
};

const DEFAULT_MANIFEST_PATH = path.resolve(
  import.meta.dirname ?? ".",
  "../fixtures/lpc-manifest.json"
);
const DEFAULT_OUT_DIR = path.resolve(
  import.meta.dirname ?? ".",
  "../fixtures/lpc-real/"
);

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      outDir: { type: "string", default: DEFAULT_OUT_DIR },
      manifest: { type: "string", default: DEFAULT_MANIFEST_PATH },
    },
    allowPositionals: false,
  });

  const outDir = path.resolve(values.outDir as string);
  const manifestPath = path.resolve(values.manifest as string);

  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    console.error(`Create one with a JSON structure like:`);
    console.error(JSON.stringify({ baseUrl: "https://example.com/lpc/", files: [{ name: "body.png", url: "body.png" }] }, null, 2));
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`Pulling LPC assets into ${outDir} ...`);

  for (const file of manifest.files) {
    const url = new URL(file.url, manifest.baseUrl).href;
    const dest = path.join(outDir, file.name);

    console.log(`  ${file.name} ← ${url}`);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`    FAILED: HTTP ${res.status} ${res.statusText}`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      console.log(`    OK (${buffer.length} bytes)`);
    } catch (err) {
      console.error(`    ERROR: ${(err as Error).message}`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

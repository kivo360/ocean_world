/**
 * End-to-end smoke test: compose example characters from the synthetic
 * fixture LPC tree, pack them into an atlas, and assert the outputs match
 * the expected dimensions / manifest shape. Auto-generates fixtures if missing.
 *
 * Run: npm run smoke
 */
import { readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadCharacterConfig } from '../src/config.js';
import { composeAll } from '../src/compose.js';
import { packAtlas } from '../src/pack.js';
import { Cache } from '../src/cache.js';
import type { AtlasManifest } from '../src/manifest.js';
import { mkdir, writeFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

async function main(): Promise<void> {
  const lpcDir = join(ROOT, 'fixtures', 'lpc');
  const composedDir = join(ROOT, 'out', 'composed');
  const atlasDir = join(ROOT, 'out', 'atlas');

  if (!existsSync(lpcDir)) {
    console.log(`[0/3] fixtures missing at ${lpcDir} — generating now`);
    const generator = join(dirname(__filename), 'generate-fixtures.ts');
    const result = spawnSync('npx', ['tsx', generator], { cwd: ROOT, stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`fixture generation failed (exit ${result.status})`);
    }
  }

  await rm(join(ROOT, 'out'), { recursive: true, force: true });
  await mkdir(composedDir, { recursive: true });
  await mkdir(atlasDir, { recursive: true });

  const { characters } = await loadCharacterConfig(join(ROOT, 'examples', 'characters.json'));
  console.log(`[1/3] compose ${characters.length} characters`);

  const cache = new Cache({ cacheDir: join(ROOT, '.cache'), enabled: true });
  const t0 = Date.now();
  const { results, failures } = await composeAll(characters, {
    cache,
    options: {
      lpcDir,
      cropToWalkCycle: true,
      srcFrameSize: 64,
      outputFrameSize: 32,
    },
  });
  console.log(`     ${results.size}/${characters.length} composed in ${Date.now() - t0}ms`);
  for (const [id, buffer] of results) {
    await writeFile(join(composedDir, `${id}.png`), buffer);
  }
  if (failures.length > 0) {
    console.error('     FAILURES:', failures);
    process.exit(1);
  }

  console.log('[2/3] verify per-character dimensions (expect 128x160)');
  for (const id of results.keys()) {
    const meta = await sharp(join(composedDir, `${id}.png`)).metadata();
    if (meta.width !== 128 || meta.height !== 160) {
      throw new Error(`${id}: expected 128x160, got ${meta.width}x${meta.height}`);
    }
  }

  console.log('[3/3] pack atlas');
  const manifest = await packAtlas({
    cache,
    options: {
      inputDir: composedDir,
      outputDir: atlasDir,
      maxAtlasSize: 2048,
      padding: 2,
      outputFrameSize: 32,
    },
  });

  console.log(`     atlas: ${manifest.atlasWidth}x${manifest.atlasHeight}, ${manifest.characters.length} sprites`);
  if (manifest.version !== 3) throw new Error(`manifest.version expected 3, got ${manifest.version}`);
  if (manifest.layout.frameWidth !== 32) throw new Error('layout.frameWidth should be 32');
  if (!manifest.layout.animations.idle) throw new Error('idle animation missing');
  if (!manifest.layout.animations['walk-e']) throw new Error('walk-e animation missing');

  const atlasStat = await stat(join(atlasDir, manifest.atlasFile));
  if (atlasStat.size === 0) throw new Error('atlas.png is empty');

  const manifestText = await readFile(join(atlasDir, 'manifest.json'), 'utf-8');
  const reparsed = JSON.parse(manifestText) as AtlasManifest;
  if (reparsed.characters.length !== characters.length) {
    throw new Error(
      `manifest character count mismatch: ${reparsed.characters.length} vs input ${characters.length}`,
    );
  }

  console.log('OK — sprite-forge smoke test passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

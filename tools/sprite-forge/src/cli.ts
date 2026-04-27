#!/usr/bin/env node
import { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCharacterConfig } from './config.js';
import { composeAll } from './compose.js';
import { packAtlas } from './pack.js';
import { Cache, ensureCacheDir } from './cache.js';

const program = new Command();
program
  .name('sprite-forge')
  .description('LPC sprite compositing and texture-atlas packing CLI')
  .version('0.2.0');

const DEFAULT_CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.cache');

program
  .command('compose')
  .description('Composite character sprites from LPC layers')
  .requiredOption('--config <path>', 'characters.json config file')
  .requiredOption('--lpc-assets <path>', 'LPC assets root directory')
  .requiredOption('--output <path>', 'output directory for composed PNGs')
  .option('--no-crop', 'disable walk-cycle cropping (output full LPC sheet)')
  .option('--src-frame-size <n>', 'source frame size in pixels', '64')
  .option('--output-frame-size <n>', 'target frame size after downscale', '32')
  .option('--cache-dir <path>', 'cache directory', DEFAULT_CACHE_DIR)
  .option('--no-cache', 'disable the content-hash cache')
  .action(async (opts: ComposeCliOptions) => {
    const configPath = resolve(opts.config);
    const lpcDir = resolve(opts.lpcAssets);
    const outputDir = resolve(opts.output);
    const cacheDir = resolve(opts.cacheDir);

    if (!existsSync(lpcDir)) throw new Error(`LPC assets dir not found: ${lpcDir}`);
    await mkdir(outputDir, { recursive: true });
    if (opts.cache !== false) await ensureCacheDir(cacheDir);

    const { characters } = await loadCharacterConfig(configPath);
    console.log(`Composing ${characters.length} character(s) from ${lpcDir}`);

    const cache = new Cache({ cacheDir, enabled: opts.cache !== false });
    const t0 = Date.now();
    const { results, failures } = await composeAll(characters, {
      cache,
      options: {
        lpcDir,
        cropToWalkCycle: opts.crop !== false,
        srcFrameSize: Number(opts.srcFrameSize),
        outputFrameSize: Number(opts.outputFrameSize),
      },
    });

    for (const [id, buffer] of results) {
      await writeFile(join(outputDir, `${id}.png`), buffer);
    }

    const dt = Date.now() - t0;
    console.log(
      `Composed ${results.size}/${characters.length} characters in ${dt}ms (${failures.length} failed) -> ${outputDir}`,
    );
    console.log(`  ${cache.summary()}`);
    if (failures.length > 0) process.exitCode = 1;
  });

program
  .command('pack')
  .description('Pack composed sprites into a texture atlas')
  .requiredOption('--input <path>', 'directory containing composed PNGs')
  .requiredOption('--output <path>', 'output directory for atlas + manifest')
  .option('--max-atlas-size <n>', 'maximum atlas dimension (auto-grows up to this)', '2048')
  .option('--padding <n>', 'padding between sprites in pixels', '2')
  .option('--frame-size <n>', 'logical frame size in the manifest', '32')
  .option('--cache-dir <path>', 'cache directory', DEFAULT_CACHE_DIR)
  .option('--no-cache', 'disable the content-hash cache')
  .action(async (opts: PackCliOptions) => {
    const inputDir = resolve(opts.input);
    const outputDir = resolve(opts.output);
    const cacheDir = resolve(opts.cacheDir);

    if (!existsSync(inputDir)) throw new Error(`Input dir not found: ${inputDir}`);
    await mkdir(outputDir, { recursive: true });
    if (opts.cache !== false) await ensureCacheDir(cacheDir);

    console.log(`Packing atlas from ${inputDir}`);
    const cache = new Cache({ cacheDir, enabled: opts.cache !== false });

    const t0 = Date.now();
    const manifest = await packAtlas({
      cache,
      options: {
        inputDir,
        outputDir,
        maxAtlasSize: Number(opts.maxAtlasSize),
        padding: Number(opts.padding),
        outputFrameSize: Number(opts.frameSize),
      },
    });

    const dt = Date.now() - t0;
    console.log(
      `Packed ${manifest.characters.length} sprites into ${manifest.atlasWidth}x${manifest.atlasHeight} atlas in ${dt}ms`,
    );
    console.log(`  ${cache.summary()}`);
    console.log(`-> ${join(outputDir, manifest.atlasFile)}`);
    console.log(`-> ${join(outputDir, 'manifest.json')}`);
  });

interface ComposeCliOptions {
  config: string;
  lpcAssets: string;
  output: string;
  crop: boolean;
  srcFrameSize: string;
  outputFrameSize: string;
  cacheDir: string;
  cache: boolean;
}

interface PackCliOptions {
  input: string;
  output: string;
  maxAtlasSize: string;
  padding: string;
  frameSize: string;
  cacheDir: string;
  cache: boolean;
}

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  process.exit(1);
});

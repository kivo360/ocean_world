import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { CharacterConfig, CharactersFile } from './manifest.js';

export type LayerCategory =
  | 'body'
  | 'hair'
  | 'shirt'
  | 'pants'
  | 'shoes'
  | 'hat'
  | 'glasses'
  | 'cape'
  | 'unknown';

export interface ResolvedLayer {
  path: string;
  category: LayerCategory;
}

export async function loadCharacterConfig(configPath: string): Promise<CharactersFile> {
  const raw = await readFile(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as CharactersFile;
  if (!parsed.characters || !Array.isArray(parsed.characters)) {
    throw new Error(`${configPath}: expected { "characters": [...] }`);
  }
  for (const c of parsed.characters) {
    if (!c.id) {
      throw new Error(`${configPath}: character missing id: ${JSON.stringify(c)}`);
    }
    const hasLayers = Array.isArray(c.layers) && c.layers.length > 0;
    const hasCategorical = !!c.body && !!c.clothing;
    if (!hasLayers && !hasCategorical) {
      throw new Error(
        `${configPath}: character "${c.id}" must specify either "layers" array or "body" + "clothing"`,
      );
    }
  }
  return parsed;
}

/**
 * Resolves character config to layer file paths under the LPC asset root.
 * Missing files are logged and skipped — never throws.
 *
 * If `config.layers` is present, those are used as-is (joined to lpcDir). The
 * category for each is inferred from its first path segment.
 *
 * Otherwise the resolver builds paths from the categorical fields under the
 * convention: {lpcDir}/{category}/{variant}/{color}.png
 */
export function resolveLayerPaths(config: CharacterConfig, lpcDir: string): ResolvedLayer[] {
  const candidates: ResolvedLayer[] = config.layers
    ? config.layers.map((rel) => ({ path: join(lpcDir, rel), category: inferCategory(rel) }))
    : resolveCategorical(config, lpcDir);

  return candidates.filter((layer) => {
    if (existsSync(layer.path)) return true;
    console.warn(`WARNING: layer not found, skipping: ${layer.path}`);
    return false;
  });
}

function resolveCategorical(config: CharacterConfig, lpcDir: string): ResolvedLayer[] {
  const candidates: ResolvedLayer[] = [];
  if (!config.body || !config.clothing) {
    return candidates;
  }

  candidates.push({
    path: join(lpcDir, 'body', config.body.base, `${config.body.skinTone}.png`),
    category: 'body',
  });

  if (config.hair) {
    candidates.push({
      path: join(lpcDir, 'hair', config.hair.style, `${config.hair.color}.png`),
      category: 'hair',
    });
  }

  candidates.push({
    path: join(lpcDir, 'torso', config.clothing.shirt, 'white.png'),
    category: 'shirt',
  });
  candidates.push({
    path: join(lpcDir, 'legs', config.clothing.pants, 'teal.png'),
    category: 'pants',
  });
  candidates.push({
    path: join(lpcDir, 'feet', config.clothing.shoes, 'brown.png'),
    category: 'shoes',
  });

  const accessories = config.accessories;
  if (accessories?.hat) {
    candidates.push({ path: join(lpcDir, 'hat', accessories.hat, 'red.png'), category: 'hat' });
  }
  if (accessories?.glasses) {
    candidates.push({
      path: join(lpcDir, 'glasses', accessories.glasses, 'black.png'),
      category: 'glasses',
    });
  }
  if (accessories?.cape) {
    candidates.push({ path: join(lpcDir, 'cape', accessories.cape, 'red.png'), category: 'cape' });
  }

  return candidates;
}

function inferCategory(rel: string): LayerCategory {
  const top = rel.split('/')[0]?.toLowerCase() ?? '';
  if (top === 'body') return 'body';
  if (top === 'hair') return 'hair';
  if (top === 'torso') {
    const fileName = basename(rel).toLowerCase();
    if (fileName.includes('cape')) return 'cape';
    return 'shirt';
  }
  if (top === 'legs') return 'pants';
  if (top === 'feet') return 'shoes';
  if (top === 'hat' || top === 'head') return 'hat';
  if (top === 'glasses' || top === 'facial') return 'glasses';
  if (top === 'cape' || top === 'behind_body') return 'cape';
  return 'unknown';
}

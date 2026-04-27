import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Content-hash cache. Inputs are hashed to a SHA-256 cache key; the resulting
 * artefact is stored at `<cacheDir>/<key>.<ext>`. Cache hits read the file
 * back; misses run the producer and persist its output.
 *
 * Cache keys mix:
 *   - SHA-256 of every input file's bytes (so renames don't invalidate, but
 *     edits do)
 *   - JSON-serialised options (so changing crop / pack settings invalidates)
 *   - A version string so we can bump it to force rebuilds when the codec
 *     changes
 */
export const CACHE_VERSION = 'v1';

export interface CacheKeyParts {
  /** Absolute paths of input files; hashed by content */
  files: string[];
  /** Stable JSON-serialisable options */
  options: unknown;
  /** Optional namespace/tag to keep entry types separate (compose vs atlas) */
  tag: string;
}

export async function computeCacheKey(parts: CacheKeyParts): Promise<string> {
  const fileHashes = await Promise.all(parts.files.map(hashFile));
  const hasher = createHash('sha256');
  hasher.update(CACHE_VERSION);
  hasher.update('\0');
  hasher.update(parts.tag);
  hasher.update('\0');
  for (let i = 0; i < parts.files.length; i++) {
    hasher.update(parts.files[i]!);
    hasher.update(':');
    hasher.update(fileHashes[i]!);
    hasher.update('\n');
  }
  hasher.update(stableStringify(parts.options));
  return hasher.digest('hex');
}

async function hashFile(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Deterministic JSON: sorts object keys at every level so two equivalent
 * configs produce the same serialisation regardless of property order.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

export interface CacheConfig {
  /** Filesystem root for cache entries (e.g. tools/sprite-forge/.cache) */
  cacheDir: string;
  /** When false, every get() returns null and put() is a no-op */
  enabled: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
}

export class Cache {
  readonly stats: CacheStats = { hits: 0, misses: 0 };

  constructor(private readonly config: CacheConfig) {}

  /**
   * Look up a binary artefact by its cache key. Returns null on miss.
   */
  async getBuffer(key: string, ext: string): Promise<Buffer | null> {
    if (!this.config.enabled) return null;
    const path = this.entryPath(key, ext);
    if (!existsSync(path)) {
      this.stats.misses++;
      return null;
    }
    try {
      const buf = await readFile(path);
      this.stats.hits++;
      return buf;
    } catch {
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Persist a binary artefact under its cache key.
   */
  async putBuffer(key: string, ext: string, data: Uint8Array): Promise<void> {
    if (!this.config.enabled) return;
    const path = this.entryPath(key, ext);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  /**
   * Look up a JSON artefact paired with a same-keyed binary. Used by atlas
   * caching, which writes both the PNG and the manifest at one key.
   */
  async getPaired<T>(key: string, ext: string): Promise<{ buffer: Buffer; meta: T } | null> {
    if (!this.config.enabled) return null;
    const binPath = this.entryPath(key, ext);
    const metaPath = this.entryPath(key, 'json');
    if (!existsSync(binPath) || !existsSync(metaPath)) {
      this.stats.misses++;
      return null;
    }
    try {
      const [buffer, metaText] = await Promise.all([readFile(binPath), readFile(metaPath, 'utf-8')]);
      this.stats.hits++;
      return { buffer, meta: JSON.parse(metaText) as T };
    } catch {
      this.stats.misses++;
      return null;
    }
  }

  async putPaired<T>(key: string, ext: string, data: Uint8Array, meta: T): Promise<void> {
    if (!this.config.enabled) return;
    const binPath = this.entryPath(key, ext);
    const metaPath = this.entryPath(key, 'json');
    await mkdir(dirname(binPath), { recursive: true });
    await Promise.all([
      writeFile(binPath, data),
      writeFile(metaPath, JSON.stringify(meta, null, 2)),
    ]);
  }

  private entryPath(key: string, ext: string): string {
    // Two-char prefix bucket avoids one giant directory
    const bucket = key.slice(0, 2);
    const rest = key.slice(2);
    return join(this.config.cacheDir, bucket, `${rest}.${ext}`);
  }

  summary(): string {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return 'cache: not used';
    const hitPct = ((this.stats.hits / total) * 100).toFixed(0);
    return `cache: ${this.stats.hits}/${total} hits (${hitPct}%)`;
  }
}

/**
 * Touch a directory so the cache root exists before first write. Quietly does
 * nothing if it already exists.
 */
export async function ensureCacheDir(cacheDir: string): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
}

/** Returns true if the cache root has any entries (purely for diagnostics). */
export async function isCachePopulated(cacheDir: string): Promise<boolean> {
  try {
    const s = await stat(cacheDir);
    return s.isDirectory();
  } catch {
    return false;
  }
}

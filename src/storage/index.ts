import { InMemoryRepository, type InMemoryConfig } from "./in-memory-repo";
import type { Repository } from "./repository";
import { SurrealRepository, type SurrealConfig } from "./surreal-repo";

export type StorageConfig =
  | ({ backend: "memory" } & InMemoryConfig)
  | ({ backend: "surreal" } & SurrealConfig);

export async function createRepository(config: StorageConfig): Promise<Repository> {
  if (config.backend === "surreal") {
    const repo = new SurrealRepository(config);
    await repo.init();
    return repo;
  }
  const repo = new InMemoryRepository(config);
  await repo.init();
  return repo;
}

/**
 * Convenience factory that reads env vars. Falls back to memory if SURREAL_URL
 * is not set — D2/D3 demos run offline by default.
 */
export async function createRepositoryFromEnv(
  defaults: InMemoryConfig = {},
): Promise<Repository> {
  const url = typeof process !== "undefined" ? process.env?.SURREAL_URL : undefined;
  if (url) {
    return createRepository({
      backend: "surreal",
      url,
      namespace: process.env?.SURREAL_NS,
      database: process.env?.SURREAL_DB,
      username: process.env?.SURREAL_USER,
      password: process.env?.SURREAL_PASS,
      ...defaults,
    });
  }
  return createRepository({ backend: "memory", ...defaults });
}

export { InMemoryRepository, SurrealRepository };
export type { Repository };
export type { Relation, EntityFilter, EventFilter, SpawnOptions, RepositoryStats } from "./repository";

// SurrealDB adapter. Lazy-connects on init() and stays offline-friendly —
// if SURREAL_URL isn't set the InMemoryRepository is used instead (see index.ts).
// Requires `surrealdb` npm package at runtime.
//
// This is a thin wrapper: the heavy sim logic still runs in-memory. SurrealDB
// persists entity state, events, and the ontology cache tables. Each mutation
// is written through on commit.

import type { WorldEvent } from "../simulation/actions";
import type { ComponentMap } from "../simulation/components";
import type { Archetype, Entity, EntitySnapshot } from "../simulation/entity";
import { InMemoryRepository, type InMemoryConfig } from "./in-memory-repo";
import type {
  EntityFilter,
  EventFilter,
  Relation,
  Repository,
  RepositoryStats,
  SpawnOptions,
} from "./repository";

export type SurrealConfig = InMemoryConfig & {
  url: string;
  namespace?: string;
  database?: string;
  username?: string;
  password?: string;
};

// Thin structural type so we don't hard-depend on surrealdb at compile time.
type SurrealClient = {
  connect(url: string, opts?: unknown): Promise<unknown>;
  signin(credentials: { username: string; password: string }): Promise<unknown>;
  use(opts: { namespace: string; database: string }): Promise<unknown>;
  query<T = unknown>(sql: string, vars?: Record<string, unknown>): Promise<T[]>;
  create<T = unknown>(table: string, data?: unknown): Promise<T[]>;
  close(): Promise<unknown>;
};

// A structural dynamic-import type.
type SurrealModule = { Surreal: new () => SurrealClient };

/**
 * SurrealRepository persists world state into SurrealDB while keeping a
 * local InMemoryRepository as the authoritative ticking engine. On each
 * commit boundary (advanceTick, spawn, relate, appendEvent) writes are
 * mirrored through to SurrealDB. Reads still come from memory for speed.
 *
 * This dual-mode design is what docs/05-storage.md calls the "SurrealDB as
 * persistence, memory for tick speed" compromise we settled on for D3.
 */
export class SurrealRepository implements Repository {
  readonly kind = "surreal" as const;

  private client: SurrealClient | null = null;
  private ready = false;
  private readonly memory: InMemoryRepository;
  private readonly config: Required<SurrealConfig>;

  constructor(config: SurrealConfig) {
    this.config = {
      url: config.url,
      namespace: config.namespace ?? "ocean",
      database: config.database ?? "world",
      username: config.username ?? "root",
      password: config.password ?? "root",
      seed: config.seed ?? 1337,
      bounds: config.bounds ?? { width: 1100, height: 700 },
      initialPersons: config.initialPersons ?? 0,
      initialMerchants: config.initialMerchants ?? 0,
      initialWanderers: config.initialWanderers ?? 0,
    };
    this.memory = new InMemoryRepository(this.config);
  }

  private async ensure(): Promise<SurrealClient> {
    if (this.client && this.ready) return this.client;
    // Dynamic import: keeps the surrealdb package optional at build time.
    const mod = (await import(/* @vite-ignore */ "surrealdb")) as unknown as SurrealModule;
    const client = new mod.Surreal();
    await client.connect(this.config.url);
    await client.signin({ username: this.config.username, password: this.config.password });
    await client.use({ namespace: this.config.namespace, database: this.config.database });
    this.client = client;
    this.ready = true;
    return client;
  }

  async init(): Promise<void> {
    await this.memory.init();
    try {
      await this.ensure();
    } catch (error) {
      throw new Error(
        `SurrealDB connect failed (${this.config.url}): ${(error as Error).message}. ` +
          `Start SurrealDB or unset SURREAL_URL to fall back to in-memory.`,
      );
    }
  }

  getMemory(): InMemoryRepository {
    return this.memory;
  }

  async reset(seed?: number): Promise<void> {
    await this.memory.reset(seed);
    if (!this.client) return;
    await this.client.query(
      "DELETE entity; DELETE physical_state; DELETE financial_state; DELETE cognitive_state; DELETE inventory_state; DELETE memory_log; DELETE event;",
    );
  }

  async getTick(): Promise<number> {
    return this.memory.getTick();
  }

  async advanceTick(count = 1): Promise<number> {
    const before = await this.memory.getTick();
    const tick = await this.memory.advanceTick(count);
    if (!this.client) return tick;

    // Mirror the events that fired during this batch.
    const events = await this.memory.listEvents({ sinceTick: before + 1 });
    for (const event of events) {
      await this.persistEvent(event).catch((e) => {
        console.warn("[surreal] event persist failed", e);
      });
    }
    // Mirror entity physical/financial state snapshots.
    const entities = await this.memory.listEntities();
    for (const e of entities) await this.persistEntityState(e).catch(() => undefined);
    return tick;
  }

  private async persistEvent(event: WorldEvent): Promise<void> {
    if (!this.client) return;
    await this.client.create("event", {
      tick: event.tick,
      kind: event.kind,
      source: event.source,
      target: event.target ?? null,
      summary: event.summary,
    });
  }

  private async persistEntity(entity: Entity): Promise<void> {
    if (!this.client) return;
    await this.client.query(
      "UPDATE type::thing('entity', $id) MERGE $data; " +
        "UPDATE type::thing('physical_state', $id) MERGE $phys; " +
        "UPDATE type::thing('financial_state', $id) MERGE $fin; " +
        "UPDATE type::thing('cognitive_state', $id) MERGE $cog;",
      {
        id: entity.id,
        data: {
          name: entity.name,
          archetype: entity.archetype,
          behaviors: entity.behaviors,
          active_behavior: entity.activeBehavior,
          created_tick: entity.createdTick,
        },
        phys: entity.components.physical
          ? {
              entity: `entity:${entity.id}`,
              x: entity.components.physical.x,
              y: entity.components.physical.y,
              speed: entity.components.physical.speed,
              perception_radius: entity.components.physical.perceptionRadius,
              energy: entity.components.physical.energy,
              dest_x: entity.components.physical.destX,
              dest_y: entity.components.physical.destY,
            }
          : {},
        fin: entity.components.financial
          ? {
              entity: `entity:${entity.id}`,
              money: entity.components.financial.money,
              goods: entity.components.financial.goods,
            }
          : {},
        cog: entity.components.cognitive
          ? {
              entity: `entity:${entity.id}`,
              values: entity.components.cognitive.values,
              attention_focus: entity.components.cognitive.attentionFocus,
              working_memory_load: entity.components.cognitive.workingMemoryLoad,
            }
          : {},
      },
    );
  }

  private async persistEntityState(entity: Entity): Promise<void> {
    if (!this.client || !entity.components.physical) return;
    await this.client.query(
      "UPDATE type::thing('physical_state', $id) MERGE $phys; " +
        "UPDATE type::thing('financial_state', $id) MERGE $fin;",
      {
        id: entity.id,
        phys: {
          x: entity.components.physical.x,
          y: entity.components.physical.y,
          energy: entity.components.physical.energy,
          dest_x: entity.components.physical.destX,
          dest_y: entity.components.physical.destY,
        },
        fin: entity.components.financial
          ? {
              money: entity.components.financial.money,
              goods: entity.components.financial.goods,
            }
          : {},
      },
    );
  }

  async spawn(opts: SpawnOptions): Promise<Entity> {
    const entity = await this.memory.spawn(opts);
    if (this.client) await this.persistEntity(entity).catch(() => undefined);
    return entity;
  }

  async getEntity(id: string): Promise<Entity | null> {
    return this.memory.getEntity(id);
  }

  async listEntities(filter?: EntityFilter): Promise<Entity[]> {
    return this.memory.listEntities(filter);
  }

  async snapshot(): Promise<EntitySnapshot[]> {
    return this.memory.snapshot();
  }

  async updateComponents(id: string, patch: Partial<ComponentMap>): Promise<Entity> {
    const updated = await this.memory.updateComponents(id, patch);
    if (this.client) await this.persistEntityState(updated).catch(() => undefined);
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const removed = await this.memory.remove(id);
    if (removed && this.client) {
      await this.client
        .query(
          "DELETE type::thing('entity', $id); DELETE physical_state WHERE entity = type::thing('entity', $id); DELETE financial_state WHERE entity = type::thing('entity', $id); DELETE cognitive_state WHERE entity = type::thing('entity', $id);",
          { id },
        )
        .catch(() => undefined);
    }
    return removed;
  }

  async relate(relation: Relation): Promise<void> {
    await this.memory.relate(relation);
    if (!this.client) return;
    await this.client
      .query("RELATE type::thing('entity', $from)->type::table($kind)->type::thing('entity', $to) SET data = $data", {
        from: relation.from,
        to: relation.to,
        kind: relation.kind,
        data: relation.data,
      })
      .catch((e) => console.warn("[surreal] relate failed", e));
  }

  async listRelations(entityId?: string): Promise<Relation[]> {
    return this.memory.listRelations(entityId);
  }

  async appendEvent(event: WorldEvent): Promise<void> {
    await this.memory.appendEvent(event);
    if (this.client) await this.persistEvent(event).catch(() => undefined);
  }

  async listEvents(filter?: EventFilter): Promise<WorldEvent[]> {
    return this.memory.listEvents(filter);
  }

  async stats(): Promise<RepositoryStats> {
    return this.memory.stats();
  }

  async close(): Promise<void> {
    if (this.client) await this.client.close().catch(() => undefined);
    this.client = null;
    this.ready = false;
  }

  // Expose underlying memory world for renderer when running in dev.
  getWorld() {
    return this.memory.getWorld();
  }

  /** Unused archetype type marker kept to preserve the import for downstream consumers. */
  _archetypeMarker?: Archetype;
}

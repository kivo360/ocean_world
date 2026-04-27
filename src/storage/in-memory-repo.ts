import { REGISTRY } from "../behaviors/registry";
import type { T3Queue } from "../llm/t3-queue";
import { resetEntityCounter, spawnEntity } from "../simulation/archetypes";
import type { WorldEvent } from "../simulation/actions";
import type { ComponentMap } from "../simulation/components";
import type { Archetype, Entity, EntitySnapshot } from "../simulation/entity";
import { createRng } from "../simulation/rng";
import { runTick } from "../simulation/tick";
import {
  addEntity,
  createWorld,
  snapshot as snapshotWorld,
  type World,
} from "../simulation/world";
import type {
  EntityFilter,
  EventFilter,
  Relation,
  Repository,
  RepositoryStats,
  SpawnOptions,
} from "./repository";

export type InMemoryConfig = {
  seed?: number;
  bounds?: { width: number; height: number };
  initialPersons?: number;
  initialMerchants?: number;
  initialWanderers?: number;
};

export class InMemoryRepository implements Repository {
  readonly kind = "memory" as const;

  private world: World;
  private relations: Relation[] = [];
  private config: Required<InMemoryConfig>;
  private t3Queue: T3Queue | null = null;

  constructor(config: InMemoryConfig = {}) {
    this.config = {
      seed: config.seed ?? 1337,
      bounds: config.bounds ?? { width: 1100, height: 700 },
      initialPersons: config.initialPersons ?? 0,
      initialMerchants: config.initialMerchants ?? 0,
      initialWanderers: config.initialWanderers ?? 0,
    };
    this.world = this.createWorld();
  }

  private createWorld(): World {
    const rng = createRng(this.config.seed);
    resetEntityCounter();
    const world = createWorld({ bounds: this.config.bounds, rng });
    for (let i = 0; i < this.config.initialPersons; i++) {
      addEntity(world, spawnEntity({ archetype: "Person", rng, bounds: this.config.bounds, tick: 0 }));
    }
    for (let i = 0; i < this.config.initialMerchants; i++) {
      addEntity(world, spawnEntity({ archetype: "Merchant", rng, bounds: this.config.bounds, tick: 0 }));
    }
    for (let i = 0; i < this.config.initialWanderers; i++) {
      addEntity(world, spawnEntity({ archetype: "Wanderer", rng, bounds: this.config.bounds, tick: 0 }));
    }
    return world;
  }

  // Expose the world for the renderer and scenarios that need direct access.
  getWorld(): World {
    return this.world;
  }

  async init(): Promise<void> {
    // No-op for memory.
  }

  async reset(seed?: number): Promise<void> {
    if (seed !== undefined) this.config.seed = seed;
    this.world = this.createWorld();
    this.relations = [];
  }

  async getTick(): Promise<number> {
    return this.world.tick;
  }

  async advanceTick(count = 1): Promise<number> {
    for (let i = 0; i < count; i++) {
      runTick(this.world, REGISTRY, { t3Queue: this.t3Queue });
    }
    return this.world.tick;
  }

  setT3Queue(queue: T3Queue | null): void {
    this.t3Queue = queue;
  }

  getT3Queue(): T3Queue | null {
    return this.t3Queue;
  }

  async spawn(opts: SpawnOptions): Promise<Entity> {
    const entity = spawnEntity({
      archetype: opts.archetype,
      rng: this.world.rng,
      bounds: this.world.bounds,
      tick: this.world.tick,
      x: opts.x,
      y: opts.y,
    });
    if (opts.values && entity.components.cognitive) {
      Object.assign(entity.components.cognitive.values, opts.values);
    }
    addEntity(this.world, entity);
    return entity;
  }

  async getEntity(id: string): Promise<Entity | null> {
    return this.world.entities.get(id) ?? null;
  }

  async listEntities(filter: EntityFilter = {}): Promise<Entity[]> {
    let entities = Array.from(this.world.entities.values());
    if (filter.archetype) {
      entities = entities.filter((e) => e.archetype === filter.archetype);
    }
    if (filter.behavior) {
      entities = entities.filter((e) => e.behaviors.includes(filter.behavior!));
    }
    if (filter.limit && entities.length > filter.limit) {
      entities = entities.slice(0, filter.limit);
    }
    return entities;
  }

  async snapshot(): Promise<EntitySnapshot[]> {
    return snapshotWorld(this.world);
  }

  async updateComponents(id: string, patch: Partial<ComponentMap>): Promise<Entity> {
    const entity = this.world.entities.get(id);
    if (!entity) throw new Error(`entity ${id} not found`);
    for (const key of Object.keys(patch) as Array<keyof ComponentMap>) {
      const existing = entity.components[key];
      const newValue = patch[key];
      if (existing && newValue && typeof existing === "object" && typeof newValue === "object") {
        Object.assign(existing, newValue);
      } else if (newValue !== undefined) {
        (entity.components as Record<string, unknown>)[key] = newValue;
      }
    }
    return entity;
  }

  async remove(id: string): Promise<boolean> {
    const existed = this.world.entities.delete(id);
    if (existed) {
      this.world.order = this.world.order.filter((e) => e !== id);
      this.relations = this.relations.filter((r) => r.from !== id && r.to !== id);
    }
    return existed;
  }

  async relate(relation: Relation): Promise<void> {
    this.relations.push(relation);
  }

  async listRelations(entityId?: string): Promise<Relation[]> {
    if (!entityId) return [...this.relations];
    return this.relations.filter((r) => r.from === entityId || r.to === entityId);
  }

  async appendEvent(event: WorldEvent): Promise<void> {
    this.world.events.push(event);
    if (this.world.events.length > 1000) {
      this.world.events.splice(0, this.world.events.length - 1000);
    }
  }

  async listEvents(filter: EventFilter = {}): Promise<WorldEvent[]> {
    let events = [...this.world.events];
    if (filter.kind) events = events.filter((e) => e.kind === filter.kind);
    if (filter.sinceTick !== undefined) {
      events = events.filter((e) => e.tick >= filter.sinceTick!);
    }
    if (filter.involvingEntity) {
      events = events.filter(
        (e) => e.source === filter.involvingEntity || e.target === filter.involvingEntity,
      );
    }
    if (filter.limit && events.length > filter.limit) {
      events = events.slice(-filter.limit);
    }
    return events;
  }

  async stats(): Promise<RepositoryStats> {
    const counts: Record<Archetype, number> = {
      Person: 0,
      Merchant: 0,
      Wanderer: 0,
      MarketMaker: 0,
      Lawkeeper: 0,
      Player: 0,
    };
    for (const e of this.world.entities.values()) counts[e.archetype]++;
    return {
      tick: this.world.tick,
      entityCount: this.world.entities.size,
      eventCount: this.world.events.length,
      archetypeCounts: counts,
    };
  }
}

// The Repository interface is the unified abstraction over world state.
// InMemoryRepository wraps the existing World. SurrealRepository persists to SurrealDB.
// The tick loop, renderer snapshot, and agent bridge all go through this interface.

import type { WorldEvent } from "../simulation/actions";
import type { Archetype, BehaviorName, Entity, EntitySnapshot } from "../simulation/entity";
import type { ComponentMap } from "../simulation/components";

export type RelationKind = "employs" | "trusts" | "member_of";

export type Relation = {
  kind: RelationKind;
  from: string;
  to: string;
  data: Record<string, string | number>;
};

export type EntityFilter = {
  archetype?: Archetype;
  behavior?: BehaviorName;
  limit?: number;
};

export type EventFilter = {
  kind?: string;
  sinceTick?: number;
  involvingEntity?: string;
  limit?: number;
};

export type SpawnOptions = {
  archetype: Archetype;
  x?: number;
  y?: number;
  values?: Partial<ComponentMap["cognitive"] extends { values: infer V } ? V : never>;
};

export type RepositoryStats = {
  tick: number;
  entityCount: number;
  eventCount: number;
  archetypeCounts: Record<Archetype, number>;
};

export interface Repository {
  readonly kind: "memory" | "surreal";

  init(): Promise<void>;

  // World lifecycle ---------------------------------------------------------
  reset(seed?: number): Promise<void>;
  getTick(): Promise<number>;
  advanceTick(count?: number): Promise<number>;

  // Entity operations -------------------------------------------------------
  spawn(opts: SpawnOptions): Promise<Entity>;
  getEntity(id: string): Promise<Entity | null>;
  listEntities(filter?: EntityFilter): Promise<Entity[]>;
  snapshot(): Promise<EntitySnapshot[]>;
  updateComponents(id: string, patch: Partial<ComponentMap>): Promise<Entity>;
  remove(id: string): Promise<boolean>;

  // Relations ---------------------------------------------------------------
  relate(relation: Relation): Promise<void>;
  listRelations(entityId?: string): Promise<Relation[]>;

  // Events ------------------------------------------------------------------
  appendEvent(event: WorldEvent): Promise<void>;
  listEvents(filter?: EventFilter): Promise<WorldEvent[]>;

  // Stats -------------------------------------------------------------------
  stats(): Promise<RepositoryStats>;
}

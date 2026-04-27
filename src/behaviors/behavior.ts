import type { Action } from "../simulation/actions";
import type { BehaviorName, Entity } from "../simulation/entity";
import type { World } from "../simulation/world";

export type BehaviorModule = {
  name: BehaviorName;
  // Utility score for T2. Must be in [0, 1] before value-weighting.
  score(entity: Entity, world: World): number;
  // Picks a typed action for this entity this tick. May advance phase.
  decide(entity: Entity, world: World): Action;
};

export type BehaviorRegistry = Record<BehaviorName, BehaviorModule>;

import { spawnPlayer } from "./archetypes";
import { smallVillage } from "../scenarios/small-village";
import { addEntity, type World } from "./world";
import type { SurrealGraphMemory } from "./surreal-graph-memory";

export function buildWorldWithPlayer(opts: {
  width: number;
  height: number;
  seed?: number;
  memoryGraph: SurrealGraphMemory;
}): World {
  const world = smallVillage(opts);
  // Spawn the player at the centre of the first region so they start cleanly
  // inside one map rather than on a region boundary.
  const home = world.regions[0];
  const spawnX = home ? home.bounds.x + home.bounds.w / 2 : world.bounds.width / 2;
  const spawnY = home ? home.bounds.y + home.bounds.h / 2 : world.bounds.height / 2;
  addEntity(
    world,
    spawnPlayer({ bounds: world.bounds, tick: world.tick, x: spawnX, y: spawnY }),
  );
  if (home) world.activeRegionId = home.id;
  return world;
}

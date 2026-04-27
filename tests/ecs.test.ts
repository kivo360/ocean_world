import { describe, it, expect, beforeEach } from "vitest";
import { resetEntityCounter, spawnEntity } from "../src/simulation/archetypes";
import { createRng } from "../src/simulation/rng";
import { addEntity, createWorld, findNearby } from "../src/simulation/world";

describe("ecs", () => {
  beforeEach(() => resetEntityCounter());

  it("spawns entities with required components", () => {
    const rng = createRng(1);
    const bounds = { width: 400, height: 400 };
    const person = spawnEntity({ archetype: "Person", rng, bounds, tick: 0 });

    expect(person.id).toMatch(/^e/);
    expect(person.components.physical).toBeDefined();
    expect(person.components.cognitive).toBeDefined();
    expect(person.components.financial).toBeDefined();
    expect(person.components.memory).toBeDefined();
    expect(person.behaviors).toContain("Wander");
  });

  it("merchant values differ from wanderer values", () => {
    const rng = createRng(42);
    const bounds = { width: 400, height: 400 };
    const merchant = spawnEntity({ archetype: "Merchant", rng, bounds, tick: 0 });
    const wanderer = spawnEntity({ archetype: "Wanderer", rng, bounds, tick: 0 });

    expect(merchant.components.cognitive!.values.profit).toBeGreaterThan(
      wanderer.components.cognitive!.values.profit,
    );
    expect(wanderer.components.cognitive!.values.curiosity).toBeGreaterThan(
      merchant.components.cognitive!.values.curiosity,
    );
  });

  it("findNearby respects perception radius", () => {
    const rng = createRng(1);
    const bounds = { width: 500, height: 500 };
    const world = createWorld({ bounds, rng });

    const a = spawnEntity({ archetype: "Person", rng, bounds, tick: 0, x: 100, y: 100 });
    const b = spawnEntity({ archetype: "Person", rng, bounds, tick: 0, x: 120, y: 100 });
    const c = spawnEntity({ archetype: "Person", rng, bounds, tick: 0, x: 400, y: 400 });
    addEntity(world, a);
    addEntity(world, b);
    addEntity(world, c);

    const nearby = findNearby(world, a, 50);
    expect(nearby.map((e) => e.id)).toEqual([b.id]);
  });
});

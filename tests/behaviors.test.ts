import { describe, it, expect, beforeEach } from "vitest";
import { resetEntityCounter, spawnEntity } from "../src/simulation/archetypes";
import { createRng } from "../src/simulation/rng";
import { addEntity, createWorld } from "../src/simulation/world";
import { Rest } from "../src/behaviors/rest";
import { Wander } from "../src/behaviors/wander";
import { Trade } from "../src/behaviors/trade";

describe("behaviors", () => {
  beforeEach(() => resetEntityCounter());

  it("Rest scores high when energy is low", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const e = spawnEntity({ archetype: "Person", rng, bounds, tick: 0 });
    e.components.physical!.energy = 0.1;
    expect(Rest.score(e, createWorld({ bounds, rng }))).toBeGreaterThan(0.8);
  });

  it("Rest scores low when energy is full", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const e = spawnEntity({ archetype: "Person", rng, bounds, tick: 0 });
    e.components.physical!.energy = 0.95;
    expect(Rest.score(e, createWorld({ bounds, rng }))).toBeLessThan(0.3);
  });

  it("Wander transitions Idle → Moving with a destination", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const world = createWorld({ bounds, rng });
    const e = spawnEntity({ archetype: "Person", rng, bounds, tick: 0 });
    addEntity(world, e);

    const action = Wander.decide(e, world);
    expect(action.kind).toBe("move_to");
    expect(e.state.Wander?.phase).toBe("Moving");
    expect(e.components.physical!.destX).not.toBeNull();
  });

  it("Trade requires goods and a buyer", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const world = createWorld({ bounds, rng });
    const seller = spawnEntity({ archetype: "Merchant", rng, bounds, tick: 0, x: 100, y: 100 });
    addEntity(world, seller);

    // No buyer nearby.
    expect(Trade.score(seller, world)).toBe(0);

    const buyer = spawnEntity({ archetype: "Person", rng, bounds, tick: 0, x: 110, y: 100 });
    buyer.components.financial!.money = 200;
    addEntity(world, buyer);
    // Trade scorer reads perceived.nearbyIds, which hasn't been populated yet
    // (perceive phase fills it). Simulate that for this unit test.
    seller.components.perceived!.nearbyIds = [buyer.id];

    expect(Trade.score(seller, world)).toBeGreaterThan(0);
  });
});

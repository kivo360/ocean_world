import { describe, it, expect, beforeEach, vi } from "vitest";
import { Gossip, decay } from "../src/behaviors/gossip";
import { resetEntityCounter, spawnEntity } from "../src/simulation/archetypes";
import { createRng } from "../src/simulation/rng";
import { createWorld, addEntity } from "../src/simulation/world";

describe("gossip", () => {
  beforeEach(() => {
    resetEntityCounter();
    vi.restoreAllMocks();
  });

  it("decay replaces one random word with [?]", () => {
    const mockRng = { next: () => 0 };
    const result = decay("hello world test", mockRng);
    expect(result).toBe("[?] world test");
  });

  it("decay handles single-word text", () => {
    const mockRng = { next: () => 0 };
    expect(decay("hello", mockRng)).toBe("[?]");
  });

  it("score returns 0 when no memory", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const e = spawnEntity({ archetype: "Person", rng, bounds, tick: 0 });
    e.components.memory = undefined;
    expect(Gossip.score(e, createWorld({ bounds, rng }))).toBe(0);
  });

  it("score returns 0 when no heard events", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const e = spawnEntity({ archetype: "Person", rng, bounds, tick: 0 });
    e.components.memory!.recent = [];
    expect(Gossip.score(e, createWorld({ bounds, rng }))).toBe(0);
  });

  it("score returns > 0 when memory has heard events", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const e = spawnEntity({ archetype: "Person", rng, bounds, tick: 0 });
    e.components.memory!.recent = [
      { tick: 1, kind: "heard", source: "e1", target: e.id, summary: "hello there" },
    ];
    expect(Gossip.score(e, createWorld({ bounds, rng }))).toBeGreaterThan(0);
  });

  it("score uses community value", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const e = spawnEntity({ archetype: "Person", rng, bounds, tick: 0 });
    e.components.memory!.recent = [
      { tick: 1, kind: "heard", source: "e1", target: e.id, summary: "hello there" },
    ];
    e.components.cognitive!.values.community = 1.0;
    const scoreHigh = Gossip.score(e, createWorld({ bounds, rng }));

    e.components.cognitive!.values.community = 0.0;
    const scoreLow = Gossip.score(e, createWorld({ bounds, rng }));

    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it("decide produces a speak action when heard events and nearby target exist", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const world = createWorld({ bounds, rng });

    const gossiper = spawnEntity({ archetype: "Person", rng, bounds, tick: 0, x: 100, y: 100 });
    gossiper.components.memory!.recent = [
      { tick: 1, kind: "heard", source: "e1", target: gossiper.id, summary: "secret news" },
    ];
    addEntity(world, gossiper);

    const target = spawnEntity({ archetype: "Person", rng, bounds, tick: 0, x: 105, y: 100 });
    addEntity(world, target);

    // Populate nearbyIds manually as perceive phase hasn't run.
    gossiper.components.perceived!.nearbyIds = [target.id];

    const action = Gossip.decide(gossiper, world);
    expect(action.kind).toBe("speak");
    expect((action as Extract<typeof action, { kind: "speak" }>).target).toBe(target.id);
    expect(gossiper.state.Gossip?.phase).toBe("Speaking");
  });

  it("decide returns noop when no heard events", () => {
    const rng = createRng(1);
    const bounds = { width: 300, height: 300 };
    const world = createWorld({ bounds, rng });

    const e = spawnEntity({ archetype: "Person", rng, bounds, tick: 0 });
    e.components.memory!.recent = [];
    addEntity(world, e);

    const action = Gossip.decide(e, world);
    expect(action.kind).toBe("noop");
  });
});

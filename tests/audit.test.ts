import { describe, it, expect } from "vitest";
import { buildWorldWithPlayer } from "../src/simulation/test-helpers";
import { auditWorld } from "../src/simulation/audit";
import { createSurrealGraphMemory } from "../src/simulation/surreal-graph-memory";
import { REGISTRY } from "../src/behaviors/registry";
import { runTick } from "../src/simulation/tick";

describe("conservation audit", () => {
  it("conserves money and goods totals over 500 ticks", () => {
    const memoryGraph = createSurrealGraphMemory({ mode: "off" });
    const world = buildWorldWithPlayer({
      width: 1100,
      height: 700,
      seed: 42,
      memoryGraph,
    });

    const initial = auditWorld(world);

    for (let i = 0; i < 500; i++) {
      runTick(world, REGISTRY);
    }

    const final = auditWorld(world);

    expect(final.moneyTotal).toBe(initial.moneyTotal);
    expect(final.goodsTotal).toBe(initial.goodsTotal);
  });
});
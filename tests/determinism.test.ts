import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { REGISTRY } from "../src/behaviors/registry";
import { resetEntityCounter } from "../src/simulation/archetypes";
import { buildWorldWithPlayer } from "../src/simulation/test-helpers";
import { runTick } from "../src/simulation/tick";
import { snapshot } from "../src/simulation/world";
import { StubT3Client } from "../src/llm/stub-client";
import { T3Queue } from "../src/llm/t3-queue";
import { createSurrealGraphMemory } from "../src/simulation/surreal-graph-memory";

function hashSnapshot(snap: unknown): string {
  return createHash("sha256").update(JSON.stringify(snap)).digest("hex");
}

async function runTicks(world: ReturnType<typeof buildWorldWithPlayer>, t3Queue: T3Queue, count: number) {
  for (let i = 0; i < count; i++) {
    runTick(world, REGISTRY, { t3Queue });
    // Flush microtasks so the async T3 batch can resolve between ticks.
    // StubT3Client returns immediately, but the async queue still schedules
    // a microtask to store resolved actions.
    await Promise.resolve();
  }
}

describe("determinism", () => {
  beforeEach(() => resetEntityCounter());

  it("produces identical snapshots given the same seed", async () => {
    const seed = 42_424;
    const ticks = 200;

    // StubT3Client provides deterministic LLM deliberation without network
    // calls or API keys, ensuring the only source of randomness is the RNG
    // seeded below.
    const t3QueueA = new T3Queue(new StubT3Client());
    const t3QueueB = new T3Queue(new StubT3Client());

    const memoryGraphA = createSurrealGraphMemory({ mode: "off" });
    await memoryGraphA.init();
    resetEntityCounter();
    const worldA = buildWorldWithPlayer({
      width: 1100,
      height: 700,
      seed,
      memoryGraph: memoryGraphA,
    });

    const memoryGraphB = createSurrealGraphMemory({ mode: "off" });
    await memoryGraphB.init();
    resetEntityCounter();
    const worldB = buildWorldWithPlayer({
      width: 1100,
      height: 700,
      seed,
      memoryGraph: memoryGraphB,
    });

    await runTicks(worldA, t3QueueA, ticks);
    await runTicks(worldB, t3QueueB, ticks);

    const hashA = hashSnapshot(snapshot(worldA));
    const hashB = hashSnapshot(snapshot(worldB));

    expect(hashA).toBe(hashB);
    expect(hashA).toMatchSnapshot();
  });

  it("produces different snapshots when the seed changes", async () => {
    const seedA = 42_424;
    const seedB = 99_991;
    const ticks = 200;

    const t3QueueA = new T3Queue(new StubT3Client());
    const t3QueueB = new T3Queue(new StubT3Client());

    const memoryGraphA = createSurrealGraphMemory({ mode: "off" });
    await memoryGraphA.init();
    resetEntityCounter();
    const worldA = buildWorldWithPlayer({
      width: 1100,
      height: 700,
      seed: seedA,
      memoryGraph: memoryGraphA,
    });

    const memoryGraphB = createSurrealGraphMemory({ mode: "off" });
    await memoryGraphB.init();
    resetEntityCounter();
    const worldB = buildWorldWithPlayer({
      width: 1100,
      height: 700,
      seed: seedB,
      memoryGraph: memoryGraphB,
    });

    await runTicks(worldA, t3QueueA, ticks);
    await runTicks(worldB, t3QueueB, ticks);

    const hashA = hashSnapshot(snapshot(worldA));
    const hashB = hashSnapshot(snapshot(worldB));

    expect(hashA).not.toBe(hashB);
  });
});

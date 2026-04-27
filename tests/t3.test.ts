import { describe, it, expect } from "vitest";
import { StubT3Client } from "../src/llm/stub-client";
import { T3Queue } from "../src/llm/t3-queue";
import { parseBatchResponse, renderBatchPrompt } from "../src/llm/prompt";
import { buildT3Context } from "../src/llm/types";
import { InMemoryRepository } from "../src/storage/in-memory-repo";
import { resetEntityCounter } from "../src/simulation/archetypes";

describe("T3 prompt rendering and parsing", () => {
  it("renders a batch with delimiter between entities", () => {
    const contexts = [
      {
        id: "a",
        name: "A",
        archetype: "Person",
        phase: "Idle",
        values: { profit: 0.5 },
        resources: { money: 10, goods: 0, energy: 0.8 },
        situation: "empty area",
        nearby: [],
        recentMemory: [],
        relevantMemories: [],
        validActions: [{ name: "rest", description: "rest" }],
      },
      {
        id: "b",
        name: "B",
        archetype: "Merchant",
        phase: "Offering",
        values: { profit: 0.9 },
        resources: { money: 100, goods: 5, energy: 0.6 },
        situation: "buyer nearby",
        nearby: [{ id: "a", name: "A", archetype: "Person" }],
        recentMemory: [],
        relevantMemories: [],
        validActions: [{ name: "trade", description: "trade" }],
      },
    ];
    const rendered = renderBatchPrompt(contexts);
    expect(rendered).toContain("---ENTITY---");
    expect(rendered).toContain("entity: a");
    expect(rendered).toContain("entity: b");
  });

  it("parses a valid JSON array response", () => {
    const raw = `[{"entityId":"a","action":{"kind":"rest"}},{"entityId":"b","action":{"kind":"trade","target":"a","goods":1,"price":5}}]`;
    const actions = parseBatchResponse(raw, ["a", "b"]);
    expect(actions.size).toBe(2);
    expect(actions.get("a")!.kind).toBe("rest");
    const bAction = actions.get("b")!;
    expect(bAction.kind).toBe("trade");
    if (bAction.kind === "trade") {
      expect(bAction.price).toBe(5);
    }
  });

  it("strips markdown fences around the JSON", () => {
    const raw = '```json\n[{"entityId":"x","action":{"kind":"noop"}}]\n```';
    const actions = parseBatchResponse(raw, ["x"]);
    expect(actions.get("x")!.kind).toBe("noop");
  });

  it("drops invalid actions but keeps valid ones", () => {
    const raw = `[{"entityId":"a","action":{"kind":"move_to","x":100,"y":200}},{"entityId":"b","action":{"kind":"garbage"}}]`;
    const actions = parseBatchResponse(raw, ["a", "b"]);
    expect(actions.size).toBe(1);
    expect(actions.has("a")).toBe(true);
  });

  it("drops actions for unexpected ids", () => {
    const raw = `[{"entityId":"intruder","action":{"kind":"rest"}}]`;
    const actions = parseBatchResponse(raw, ["a"]);
    expect(actions.size).toBe(0);
  });
});

describe("StubT3Client", () => {
  it("returns an action for every context", async () => {
    const client = new StubT3Client();
    const contexts = [
      {
        id: "e1",
        name: "E1",
        archetype: "Person",
        phase: "Idle",
        values: { profit: 0.3, community: 0.9, curiosity: 0.2, fairness: 0.5, autonomy: 0.5 },
        resources: { money: 10, goods: 0, energy: 0.8 },
        situation: "crowd",
        nearby: [{ id: "neighbor", name: "N", archetype: "Person" }],
        recentMemory: [],
        relevantMemories: [],
        validActions: [],
      },
    ];
    const out = await client.selectActions(contexts);
    expect(out.length).toBe(1);
    expect(out[0]!.entityId).toBe("e1");
    expect(out[0]!.action.kind).toBe("speak");
  });
});

describe("T3Queue + tick integration", () => {
  it("queued entities receive T3 actions on subsequent ticks", async () => {
    resetEntityCounter();
    const repo = new InMemoryRepository({ seed: 5, initialPersons: 0 });
    await repo.init();

    // Spawn an entity that will trigger T3 (single-behavior, isolated).
    await repo.spawn({ archetype: "Person" });

    const queue = new T3Queue(new StubT3Client(), 8);
    repo.setT3Queue(queue);

    // Run several ticks so any queued entity gets resolved.
    for (let i = 0; i < 10; i++) await repo.advanceTick(1);

    // Just verify the plumbing doesn't crash and the tick advances.
    const stats = await repo.stats();
    expect(stats.tick).toBe(10);
  });

  it("buildT3Context produces a structured context", () => {
    resetEntityCounter();
    const repo = new InMemoryRepository({ seed: 2, initialPersons: 1 });
    repo.init();
    const entity = Array.from(repo.getWorld().entities.values())[0]!;
    const ctx = buildT3Context(entity, "test situation");
    expect(ctx.id).toBe(entity.id);
    expect(ctx.situation).toBe("test situation");
    expect(ctx.validActions.length).toBeGreaterThan(0);
  });
});

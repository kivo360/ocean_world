import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository } from "../src/storage/in-memory-repo";
import { executeToolCall, TOOL_SCHEMAS } from "../src/agent-bridge";

describe("agent bridge", () => {
  let repo: InMemoryRepository;
  beforeEach(async () => {
    repo = new InMemoryRepository({ seed: 11, initialPersons: 3, initialMerchants: 1 });
    await repo.init();
  });

  it("exports schemas for every tool", () => {
    const names = TOOL_SCHEMAS.map((t) => t.name);
    expect(names).toContain("spawn_entity");
    expect(names).toContain("run_ticks");
    expect(names).toContain("inspect_entity");
    expect(names).toContain("list_entities");
    expect(names).toContain("summarize_events");
    expect(names).toContain("wire_relation");
    expect(names).toContain("world_stats");
  });

  it("spawn_entity creates new entities", async () => {
    const before = (await repo.stats()).entityCount;
    const result = await executeToolCall(repo, {
      tool: "spawn_entity",
      input: { archetype: "Merchant", count: 3 },
    });
    expect(result.ok).toBe(true);
    expect((await repo.stats()).entityCount).toBe(before + 3);
  });

  it("run_ticks advances the world", async () => {
    await executeToolCall(repo, { tool: "run_ticks", input: { ticks: 5 } });
    expect(await repo.getTick()).toBe(5);
  });

  it("inspect_entity returns public view", async () => {
    const entities = await repo.listEntities({ limit: 1 });
    const id = entities[0]!.id;
    const result = await executeToolCall(repo, {
      tool: "inspect_entity",
      input: { entityId: id },
    });
    expect(result.ok).toBe(true);
    expect((result as { ok: true; data: { id: string } }).data.id).toBe(id);
  });

  it("summarize_events returns counts by kind after activity", async () => {
    await executeToolCall(repo, { tool: "run_ticks", input: { ticks: 30 } });
    const result = await executeToolCall(repo, {
      tool: "summarize_events",
      input: { limit: 100 },
    });
    expect(result.ok).toBe(true);
    const data = (result as { ok: true; data: { byKind: Record<string, number>; total: number } }).data;
    expect(typeof data.total).toBe("number");
  });

  it("wire_relation stores the edge", async () => {
    const entities = await repo.listEntities({ limit: 2 });
    const result = await executeToolCall(repo, {
      tool: "wire_relation",
      input: {
        kind: "employs",
        from: entities[0]!.id,
        to: entities[1]!.id,
        data: { role: "clerk" },
      },
    });
    expect(result.ok).toBe(true);
    expect((await repo.listRelations()).length).toBe(1);
  });

  it("inspect_entity fails for unknown id", async () => {
    const result = await executeToolCall(repo, {
      tool: "inspect_entity",
      input: { entityId: "nonexistent" },
    });
    expect(result.ok).toBe(false);
  });

  it("unknown tool returns error", async () => {
    const result = await executeToolCall(repo, {
      tool: "frobnicate" as never,
      input: {} as never,
    });
    expect(result.ok).toBe(false);
  });
});

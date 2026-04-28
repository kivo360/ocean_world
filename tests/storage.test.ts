import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository } from "../src/storage/in-memory-repo";

describe("InMemoryRepository", () => {
  let repo: InMemoryRepository;

  beforeEach(async () => {
    repo = new InMemoryRepository({
      seed: 7,
      initialPersons: 5,
      initialMerchants: 1,
    });
    await repo.init();
  });

  it("spawns initial population", async () => {
    const stats = await repo.stats();
    expect(stats.entityCount).toBe(6);
    expect(stats.archetypeCounts.Person).toBe(5);
    expect(stats.archetypeCounts.Merchant).toBe(1);
  });

  it("advanceTick progresses the world and emits events", async () => {
    const before = await repo.stats();
    await repo.advanceTick(10);
    const after = await repo.stats();
    expect(after.tick).toBe(before.tick + 10);
  });

  it("spawn adds a new entity", async () => {
    await repo.spawn({ archetype: "Wanderer" });
    const stats = await repo.stats();
    expect(stats.archetypeCounts.Wanderer).toBe(1);
  });

  it("listEntities filters by archetype and respects limit", async () => {
    const persons = await repo.listEntities({ archetype: "Person" });
    expect(persons.length).toBe(5);
    const limited = await repo.listEntities({ limit: 2 });
    expect(limited.length).toBe(2);
  });

  it("updateComponents patches cognitive values", async () => {
    const all = await repo.listEntities({ limit: 1 });
    const id = all[0]!.id;
    await repo.updateComponents(id, {
      cognitive: {
        values: {
          profit: 0.99,
          community: 0.1,
          curiosity: 0.1,
          fairness: 0.1,
          autonomy: 0.1,
        },
        attentionFocus: null,
        workingMemoryLoad: 0,
      },
    });
    const updated = (await repo.getEntity(id))!;
    expect(updated.components.cognitive!.values.profit).toBe(0.99);
  });

  it("relations persist and can be queried", async () => {
    const entities = await repo.listEntities({ limit: 2 });
    await repo.relate({
      kind: "trusts",
      from: entities[0]!.id,
      to: entities[1]!.id,
      data: { weight: 0.8 },
    });
    const rels = await repo.listRelations(entities[0]!.id);
    expect(rels.length).toBe(1);
    expect(rels[0]!.kind).toBe("trusts");
  });

  it("reset clears state and reseeds", async () => {
    await repo.advanceTick(5);
    await repo.reset(42);
    expect(await repo.getTick()).toBe(0);
  });
});

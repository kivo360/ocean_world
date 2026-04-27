import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRegistry, loadOntology } from "../src/ontology";
import {
  runOrchestrator,
  DomainQueue,
  pickStrategy,
  StubProposer,
  StubEmbeddingClient,
  StubCritic,
  RejectedStore,
  gateStringMatch,
  gateEmbedding,
  gateShacl,
  gateReferences,
  topologicalSort,
  cosineSimilarity,
  editDistance,
  DEFAULT_TARGETS,
} from "../src/orchestrator";
import type { Candidate } from "../src/orchestrator";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ONTOLOGY_DIR = resolve(projectRoot, "ontology");

describe("embeddings", () => {
  it("cosine of identical vectors is 1", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });
  it("cosine of orthogonal vectors is 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  it("editDistance is correct for simple cases", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("abc", "abc")).toBe(0);
  });
  it("stub embedding returns unit-length deterministic vector", async () => {
    const client = new StubEmbeddingClient(64);
    const a = await client.embed("financial trade");
    const b = await client.embed("financial trade");
    const c = await client.embed("completely different words here");
    const norm = Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(a).toEqual(b);
    expect(cosineSimilarity(a, c)).toBeLessThan(cosineSimilarity(a, b));
  });
});

describe("domain queue", () => {
  let registry: Awaited<ReturnType<typeof createRegistryFromDisk>>;
  beforeEach(async () => {
    registry = await createRegistryFromDisk();
  });

  it("picks the sparsest domain", () => {
    const queue = new DomainQueue(registry, DEFAULT_TARGETS);
    const picked = queue.pick();
    expect(picked).toBeTruthy();
    // Organizational has nothing in the shipped bundle, so it should come up first.
    expect(picked).toBe("organizational");
  });

  it("recordRound moves on to different domain on next pick via staleness/fill", () => {
    const queue = new DomainQueue(registry, DEFAULT_TARGETS);
    const first = queue.pick()!;
    queue.recordRound(first, 0, 4); // no accepts
    queue.recordRound(first, 0, 4);
    queue.recordRound(first, 0, 4); // soft stop triggers
    // After soft stop, pick moves to the next sparsest.
    const next = queue.pick();
    expect(next).not.toBe(first);
  });
});

describe("pickStrategy", () => {
  it("returns broad_survey below 0.3", () => {
    expect(pickStrategy(0.1)).toBe("broad_survey");
  });
  it("returns gap_fill between 0.3 and 0.7", () => {
    expect(pickStrategy(0.5)).toBe("gap_fill");
  });
  it("returns specialization at or above 0.7", () => {
    expect(pickStrategy(0.8)).toBe("specialization");
  });
});

describe("gates", () => {
  it("gate1 rejects exact name duplicates", async () => {
    const registry = await createRegistryFromDisk();
    const candidate: Candidate = {
      kind: "component",
      name: "FinancialState",
      domain: "economic",
      description: "dup",
      data: {
        "@id": "ecs:FinancialState",
        name: "FinancialState",
        category: "resource",
        domain: "economic",
        description: "dup",
        fields: [{ name: "money", type: "float" }],
      },
    };
    const result = gateStringMatch({
      candidate,
      registry,
      embedder: new StubEmbeddingClient(),
      existingEmbeddings: new Map(),
    });
    expect(result.ok).toBe(false);
    expect(result.zone).toBe("duplicate");
  });

  it("gate3 rejects a component with 0 fields", () => {
    const registry = {
      getBundle: () => ({ components: [], behaviors: [], archetypes: [], hierarchies: [] }),
    } as unknown as Parameters<typeof gateShacl>[0]["registry"];
    const candidate: Candidate = {
      kind: "component",
      name: "Invalid",
      domain: "cognitive",
      description: "x",
      data: {
        "@id": "ecs:Invalid",
        name: "Invalid",
        category: "state",
        domain: "cognitive",
        description: "x",
        fields: [],
      },
    };
    const result = gateShacl({
      candidate,
      registry,
      embedder: new StubEmbeddingClient(),
      existingEmbeddings: new Map(),
    });
    expect(result.ok).toBe(false);
  });

  it("gate4 rejects behavior referencing unknown component", async () => {
    const registry = await createRegistryFromDisk();
    const candidate: Candidate = {
      kind: "behavior",
      name: "UnknownRef",
      domain: "economic",
      description: "x",
      data: {
        "@id": "ecs:UnknownRef",
        name: "UnknownRef",
        domain: "economic",
        description: "x",
        required_components: ["ecs:NonExistent"],
        reads: [],
        writes: [],
        actions: [{ name: "do" }],
        state_machine: {
          states: ["A", "B"],
          initial: "A",
          transitions: [{ from: "A", to: "B", on: "do" }],
        },
      },
    };
    const result = gateReferences({
      candidate,
      registry,
      embedder: new StubEmbeddingClient(),
      existingEmbeddings: new Map(),
    });
    expect(result.ok).toBe(false);
  });

  it("gate2 embedding returns novel for a truly-different concept", async () => {
    const registry = await createRegistryFromDisk();
    const candidate: Candidate = {
      kind: "component",
      name: "Quantum_Entanglement_1234",
      domain: "cognitive",
      description: "physical correlation between particles across distance",
      data: {
        "@id": "ecs:Quantum_Entanglement_1234",
        name: "Quantum_Entanglement_1234",
        category: "state",
        domain: "cognitive",
        description: "physical correlation between particles across distance",
        fields: [{ name: "correlation", type: "float" }],
      },
    };
    const result = await gateEmbedding({
      candidate,
      registry,
      embedder: new StubEmbeddingClient(),
      existingEmbeddings: new Map(),
    });
    expect(result.ok).toBe(true);
    expect(result.zone).toBe("novel");
  });
});

describe("topological sort", () => {
  it("sorts component → behavior → archetype", () => {
    const candidates: Candidate[] = [
      {
        kind: "archetype",
        name: "A",
        domain: "economic",
        description: "",
        data: { "@id": "ecs:A", name: "A", scale: "micro", components: [], behaviors: [] },
      },
      {
        kind: "behavior",
        name: "B",
        domain: "economic",
        description: "",
        data: {
          "@id": "ecs:B",
          name: "B",
          domain: "economic",
          description: "",
          required_components: [],
          actions: [{ name: "x" }],
          state_machine: { states: ["s1", "s2"], initial: "s1", transitions: [{ from: "s1", to: "s2", on: "x" }] },
        },
      },
      {
        kind: "component",
        name: "C",
        domain: "economic",
        description: "",
        data: {
          "@id": "ecs:C",
          name: "C",
          category: "state",
          domain: "economic",
          description: "",
          fields: [{ name: "v", type: "float" }],
        },
      },
    ];
    const sorted = topologicalSort(candidates);
    expect(sorted.map((c) => c.kind)).toEqual(["component", "behavior", "archetype"]);
  });
});

describe("rejected store", () => {
  it("surfaces recent rejections by domain", () => {
    const store = new RejectedStore();
    store.record({ name: "A", kind: "component", domain: "economic", reason: "dup", rejectedAt: 1 });
    store.record({ name: "B", kind: "component", domain: "social", reason: "bad", rejectedAt: 2 });
    store.record({ name: "C", kind: "behavior", domain: "economic", reason: "refs", rejectedAt: 3 });
    expect(store.recentInDomain("economic", 5).map((e) => e.name)).toEqual(["C", "A"]);
    expect(store.has("B")).toBe(true);
  });
});

describe("end-to-end orchestrator run (stub)", () => {
  it("runs several rounds and accepts at least one candidate", async () => {
    const registry = await createRegistryFromDisk();
    const report = await runOrchestrator(registry, {
      proposer: new StubProposer(7),
      critic: new StubCritic(),
      embedder: new StubEmbeddingClient(64),
      budget: { maxRounds: 6, maxLlmCalls: 1000, maxAcceptances: 50 },
      batchSize: 3,
      ragOptions: { seedsDir: resolve(ONTOLOGY_DIR, "seeds") },
    });
    expect(report.rounds).toBeGreaterThan(0);
    expect(report.accepted.length).toBeGreaterThan(0);
  });

  it("integrated candidates appear in registry counts", async () => {
    const registry = await createRegistryFromDisk();
    const before = registry.counts();
    await runOrchestrator(registry, {
      proposer: new StubProposer(42),
      critic: new StubCritic(),
      embedder: new StubEmbeddingClient(64),
      budget: { maxRounds: 4, maxLlmCalls: 1000, maxAcceptances: 20 },
      batchSize: 3,
      ragOptions: { seedsDir: resolve(ONTOLOGY_DIR, "seeds") },
    });
    const after = registry.counts();
    const grew =
      after.components > before.components ||
      after.behaviors > before.behaviors ||
      after.archetypes > before.archetypes;
    expect(grew).toBe(true);
  });
});

async function createRegistryFromDisk() {
  const { bundle } = await loadOntology(ONTOLOGY_DIR);
  return createRegistry(bundle);
}

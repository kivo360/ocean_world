import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  DeterministicObserver,
  runEvolveLoop,
  computeDomainPressure,
  detectOrphanComponents,
  detectStuckEntities,
} from "../src/observer";
import type { GapSignal } from "../src/observer";
import { createRegistry, loadOntology } from "../src/ontology";
import { InMemoryRepository } from "../src/storage/in-memory-repo";
import {
  StubCritic,
  StubEmbeddingClient,
  StubProposer,
} from "../src/orchestrator";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ONTOLOGY_DIR = resolve(projectRoot, "ontology");

async function makeSystem() {
  const { bundle } = await loadOntology(ONTOLOGY_DIR);
  const registry = createRegistry(bundle);
  const repo = new InMemoryRepository({ seed: 42, initialPersons: 10, initialMerchants: 2 });
  await repo.init();
  return { registry, repo };
}

describe("gap detectors", () => {
  it("detectOrphanComponents flags components unused by any behavior", async () => {
    const { registry, repo } = await makeSystem();
    registry.addComponent({
      "@id": "ecs:UnusedC",
      name: "UnusedC",
      category: "state",
      domain: "cognitive",
      description: "no reader",
      fields: [{ name: "x", type: "float" }],
    });
    const signals = await detectOrphanComponents({ repo, registry, sinceTick: 0, endTick: 10 });
    const names = signals.map((s) => s.evidence);
    expect(names.some((e) => e.includes("UnusedC"))).toBe(true);
  });

  it("detectStuckEntities emits a signal when few entities interact", async () => {
    const { registry, repo } = await makeSystem();
    // Don't advance ticks — no events at all, so everyone is "stuck".
    const signals = await detectStuckEntities({ repo, registry, sinceTick: 0, endTick: 5 });
    expect(signals.length).toBe(1);
    expect(signals[0]!.kind).toBe("stuck_entity");
  });
});

describe("domain pressure aggregation", () => {
  it("weights by severity", () => {
    const signals: GapSignal[] = [
      { kind: "orphan_component", severity: "low", domain: "cognitive", evidence: "", suggestion: "" },
      { kind: "stuck_entity", severity: "high", domain: "social", evidence: "", suggestion: "" },
      { kind: "inactive_behavior", severity: "medium", domain: "social", evidence: "", suggestion: "" },
    ];
    const p = computeDomainPressure(signals);
    expect(p.cognitive).toBe(1);
    expect(p.social).toBe(5); // 3 + 2
  });
});

describe("DeterministicObserver", () => {
  it("produces a report with signals + domain pressure", async () => {
    const { registry, repo } = await makeSystem();
    await repo.advanceTick(30);
    const observer = new DeterministicObserver();
    const report = await observer.observe({ repo, registry, sinceTick: 0, endTick: 30 });
    expect(Array.isArray(report.signals)).toBe(true);
    expect(typeof report.domainPressure).toBe("object");
  });
});

describe("full evolve loop (stubs only)", () => {
  it("runs cycles, grows the registry from observed gaps", async () => {
    const { registry, repo } = await makeSystem();
    const countsBefore = registry.counts();
    const report = await runEvolveLoop(repo, registry, {
      cycles: 2,
      ticksPerCycle: 30,
      orchestratorOptions: {
        proposer: new StubProposer(31),
        critic: new StubCritic(),
        embedder: new StubEmbeddingClient(64),
        budget: { maxRounds: 3, maxLlmCalls: 1000, maxAcceptances: 10 },
        batchSize: 2,
        ragOptions: { seedsDir: resolve(ONTOLOGY_DIR, "seeds") },
      },
    });
    expect(report.cycles.length).toBe(2);
    const countsAfter = registry.counts();
    const grew =
      countsAfter.components > countsBefore.components ||
      countsAfter.behaviors > countsBefore.behaviors ||
      countsAfter.archetypes > countsBefore.archetypes;
    expect(grew).toBe(true);
    expect(report.finalStats.tick).toBe(60);
  });
});

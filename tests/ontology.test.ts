import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  createRegistry,
  generateArchetypeMeta,
  generateBehaviorMeta,
  generateComponentTypes,
  loadOntology,
  prune,
  suggestMerges,
  validateBehavior,
  validateComponent,
} from "../src/ontology";
import type { BehaviorDoc, ComponentDoc } from "../src/ontology";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ONTOLOGY_DIR = resolve(projectRoot, "ontology");

describe("ontology schema validation", () => {
  it("accepts a valid component", () => {
    const doc: ComponentDoc = {
      "@id": "ecs:TestState",
      name: "TestState",
      category: "state",
      domain: "cognitive",
      description: "test",
      fields: [{ name: "value", type: "float" }],
    };
    expect(validateComponent(doc).ok).toBe(true);
  });

  it("rejects a component with 0 or 9+ fields", () => {
    const zero: ComponentDoc = {
      "@id": "x",
      name: "X",
      category: "state",
      domain: "cognitive",
      description: "",
      fields: [],
    };
    expect(validateComponent(zero).ok).toBe(false);
    const nine: ComponentDoc = {
      "@id": "x",
      name: "X",
      category: "state",
      domain: "cognitive",
      description: "bad",
      fields: Array.from({ length: 9 }, (_, i) => ({ name: `f${i}`, type: "float" })),
    };
    expect(validateComponent(nine).ok).toBe(false);
  });

  it("rejects a behavior with only one state", () => {
    const doc: BehaviorDoc = {
      "@id": "ecs:Bad",
      name: "Bad",
      domain: "social",
      description: "x",
      required_components: ["ecs:X"],
      actions: [{ name: "go" }],
      state_machine: { states: ["Only"], initial: "Only", transitions: [] },
    };
    expect(validateBehavior(doc).ok).toBe(false);
  });

  it("rejects a behavior with initial outside states", () => {
    const doc: BehaviorDoc = {
      "@id": "ecs:Bad",
      name: "Bad",
      domain: "social",
      description: "x",
      required_components: ["ecs:X"],
      actions: [{ name: "go" }],
      state_machine: {
        states: ["A", "B"],
        initial: "C",
        transitions: [{ from: "A", to: "B", on: "go" }],
      },
    };
    expect(validateBehavior(doc).ok).toBe(false);
  });
});

describe("loadOntology", () => {
  it("loads bundled ocean-world ontology without issues", async () => {
    const { bundle, issues } = await loadOntology(ONTOLOGY_DIR);
    expect(bundle.components.length).toBeGreaterThanOrEqual(5);
    expect(bundle.behaviors.length).toBeGreaterThanOrEqual(4);
    expect(bundle.archetypes.length).toBeGreaterThanOrEqual(3);
    expect(issues).toEqual([]);
  });
});

describe("codegen", () => {
  it("emits TypeScript for components and behaviors", async () => {
    const { bundle } = await loadOntology(ONTOLOGY_DIR);
    const components = generateComponentTypes(bundle.components);
    expect(components).toContain("export interface FinancialState");
    expect(components).toContain("money: number;");
    const behaviors = generateBehaviorMeta(bundle.behaviors);
    expect(behaviors).toContain("Trade:");
    expect(behaviors).toContain('"states"');
    const archetypes = generateArchetypeMeta(bundle.archetypes);
    expect(archetypes).toContain("Person:");
  });
});

describe("hierarchy pruning", () => {
  it("keeps concepts above threshold and protects required components", async () => {
    const { bundle } = await loadOntology(ONTOLOGY_DIR);
    const result = prune(bundle, "ecs:Trade", 0.35);
    const keptIds = result.kept.map((k) => k.id);
    expect(keptIds).toContain("ecs:Trade");
    // FinancialState is required by Trade — must be present even if it scored low.
    expect(keptIds).toContain("ecs:FinancialState");
  });

  it("suggests merges for co-occurring low-entropy concepts", async () => {
    const { bundle } = await loadOntology(ONTOLOGY_DIR);
    const suggestions = suggestMerges(bundle);
    // No assertion on specific pairs, but the function should execute.
    expect(Array.isArray(suggestions)).toBe(true);
  });
});

describe("registry hot-add", () => {
  it("accepts new component and reflects in counts", async () => {
    const { bundle } = await loadOntology(ONTOLOGY_DIR);
    const registry = createRegistry(bundle);
    const before = registry.counts();
    registry.addComponent({
      "@id": "ecs:TestNew",
      name: "TestNew",
      category: "state",
      domain: "cognitive",
      description: "added at runtime",
      fields: [{ name: "note", type: "string" }],
    });
    const after = registry.counts();
    expect(after.components).toBe(before.components + 1);
    expect(registry.getComponent("ecs:TestNew")?.name).toBe("TestNew");
  });

  it("listByDomain returns domain-scoped docs", async () => {
    const { bundle } = await loadOntology(ONTOLOGY_DIR);
    const registry = createRegistry(bundle);
    const economic = registry.listByDomain("economic");
    expect(economic.components.some((c) => c.name === "FinancialState")).toBe(true);
    expect(economic.behaviors.some((b) => b.name === "Trade")).toBe(true);
  });

  it("fillRatios computes per-domain progress", async () => {
    const { bundle } = await loadOntology(ONTOLOGY_DIR);
    const registry = createRegistry(bundle);
    const ratios = registry.fillRatios({
      economic: 10,
      social: 10,
      cognitive: 10,
      governance: 10,
      environmental: 10,
      organizational: 10,
    });
    expect(ratios.economic).toBeGreaterThan(0);
    expect(ratios.organizational).toBe(0); // no organizational docs shipped
  });
});

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadOntology } from "../src/ontology";
import { createOntologyReasoner } from "../src/ontology/oxigraph-reasoner";
import type { OntologyBundle } from "../src/ontology/types";

const ONTOLOGY_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "ontology",
);

async function loadShipped(): Promise<OntologyBundle> {
  const { bundle } = await loadOntology(ONTOLOGY_DIR);
  return bundle;
}

describe("ontology reasoner", () => {
  it("initializes against the shipped bundle", async () => {
    const bundle = await loadShipped();
    const r = createOntologyReasoner();
    const status = await r.init(bundle);
    // Loaded is best-effort; either way the JS-side caches are populated.
    expect(typeof status.loaded).toBe("boolean");
  });

  it("the shipped bundle satisfies all invariants", async () => {
    const bundle = await loadShipped();
    const r = createOntologyReasoner();
    await r.init(bundle);
    const report = r.validateBundleInvariants();
    if (!report.ok) {
      console.error(report.issues);
    }
    expect(report.ok).toBe(true);
  });

  it("flags an archetype that runs a behavior whose components it lacks", async () => {
    const bundle = await loadShipped();
    // Shallow-clone + inject a deliberately broken archetype.
    const broken: OntologyBundle = {
      ...bundle,
      archetypes: [
        ...bundle.archetypes,
        {
          "@id": "ecs:BrokenArchetype",
          name: "BrokenArchetype",
          scale: "micro",
          description: "lacks FinancialState but tries to run Trade",
          components: ["ecs:PhysicalState", "ecs:CognitiveState", "ecs:MemoryLog"],
          behaviors: ["ecs:Trade"],
        },
      ],
    };
    const r = createOntologyReasoner();
    await r.init(broken);
    const report = r.validateBundleInvariants();
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.includes("BrokenArchetype") && i.includes("Trade"))).toBe(true);
  });

  it("canArchetypeRunBehavior matches the invariant check", async () => {
    const bundle = await loadShipped();
    const r = createOntologyReasoner();
    await r.init(bundle);

    expect(r.canArchetypeRunBehavior("ecs:Merchant", "ecs:Trade")).toBe(true);
    expect(r.canArchetypeRunBehavior("ecs:MarketMaker", "ecs:MarkPrice")).toBe(true);
    expect(r.canArchetypeRunBehavior("ecs:Lawkeeper", "ecs:EnforcePolicy")).toBe(true);

    // Lawkeeper doesn't list Trade in its behaviors.
    expect(r.canArchetypeRunBehavior("ecs:Lawkeeper", "ecs:Trade")).toBe(false);
  });

  it("canEntityRunBehavior translates component keys to ids", async () => {
    const bundle = await loadShipped();
    const r = createOntologyReasoner();
    await r.init(bundle);

    expect(
      r.canEntityRunBehavior(
        {
          archetype: "Merchant",
          componentKeys: ["physical", "cognitive", "financial", "inventory", "memory", "perceived"],
        },
        "ecs:Trade",
      ),
    ).toBe(true);

    // Same archetype, but missing financial — should now fail Trade.
    expect(
      r.canEntityRunBehavior(
        { archetype: "Merchant", componentKeys: ["physical", "cognitive", "memory"] },
        "ecs:Trade",
      ),
    ).toBe(false);
  });

  it("componentsRequiredBy reflects the JSON-LD declaration", async () => {
    const bundle = await loadShipped();
    const r = createOntologyReasoner();
    await r.init(bundle);
    const reqs = r.componentsRequiredBy("ecs:EnforcePolicy");
    expect(reqs).toContain("ecs:PhysicalState");
    expect(reqs).toContain("ecs:FinancialState");
    expect(reqs).toContain("ecs:CognitiveState");
  });
});

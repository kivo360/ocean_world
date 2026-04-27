// Oxigraph-backed OWL/SPARQL reasoner. Used by both:
//   - `npm run ontology:validate` (CLI)  — enforces global invariants at
//     build time so a bad bundle can't ship.
//   - The browser runtime — wraps every T3/T2 decision so the chosen behavior
//     is provably executable given the entity's components.
//
// We deliberately keep the OWL we actually rely on tiny:
//   - `ecs:requiresComponent` — a behavior's required component
//   - `ecs:hasComponent`     — an archetype's installed components
//   - `ecs:hasBehavior`      — an archetype's available behaviors
//   - `ecs:Component`/`ecs:Behavior`/`ecs:Archetype` superclasses
//
// Adding richer axioms (disjointness, subClassOf chains for component
// hierarchies) doesn't change the API; the SPARQL queries below already
// follow `rdfs:subClassOf*` so transitive reasoning will Just Work.

import type {
  ArchetypeDoc,
  BehaviorDoc,
  ComponentDoc,
  OntologyBundle,
} from "./types";

// Structural shape that matches both `oxigraph` (Node) and `oxigraph/web`
// (browser). The web entry-point requires an init() call before Store is
// usable; the Node entry-point does not.
type OxigraphStore = {
  load(input: string | Uint8Array, options: { format: string; base_iri?: string }): unknown;
  query(query: string): unknown;
  add?(quad: unknown): void;
  delete?(quad: unknown): void;
  readonly size: number;
};

type OxigraphModule = {
  Store: new () => OxigraphStore;
  default?: (input?: unknown) => Promise<unknown>; // web init()
};

export type ReasonerStatus = {
  loaded: boolean;
  triples: number;
  lastError?: string;
};

export type ValidationReport = {
  ok: boolean;
  issues: string[];
};

export type EntitySnapshotForCheck = {
  archetype: string;       // e.g. "MarketMaker"
  componentKeys: string[]; // e.g. ["physical","cognitive","financial","inventory","memory","perceived"]
};

export interface OntologyReasoner {
  init(bundle: OntologyBundle): Promise<ReasonerStatus>;
  status(): ReasonerStatus;
  /** Build-time invariants the bundle must satisfy. */
  validateBundleInvariants(): ValidationReport;
  /** Runtime guardrail: can this archetype's spec run this behavior? */
  canArchetypeRunBehavior(archetypeId: string, behaviorId: string): boolean;
  /** Stronger runtime check using a live entity's actual component bag. */
  canEntityRunBehavior(entity: EntitySnapshotForCheck, behaviorId: string): boolean;
  /** List the components a behavior requires. */
  componentsRequiredBy(behaviorId: string): string[];
}

const NS = "https://ocean-world.local/ontology/";

const COMPONENT_KEY_TO_ID: Record<string, string> = {
  physical: "ecs:PhysicalState",
  cognitive: "ecs:CognitiveState",
  financial: "ecs:FinancialState",
  inventory: "ecs:InventoryState",
  memory: "ecs:MemoryLog",
  perceived: "ecs:Perceived",
};

export function createOntologyReasoner(opts: {
  /** Pre-loaded module — pass when the caller already imported oxigraph
   *  (e.g. CLI uses node entry, browser uses web entry). */
  module?: OxigraphModule;
  /** Explicit URL to the .wasm payload. Required in browser (Vite's
   *  `?url` import) so init() can fetch it correctly; undefined in Node. */
  wasmUrl?: string | URL;
  logger?: (msg: string) => void;
} = {}): OntologyReasoner {
  const log = opts.logger ?? (() => undefined);
  let store: OxigraphStore | null = null;
  let loadedBundle: OntologyBundle | null = null;
  let lastError: string | undefined;

  // Cache derived per-behavior required components for quick runtime checks.
  const behaviorReqs = new Map<string, string[]>();
  const archetypeComponents = new Map<string, Set<string>>();
  const archetypeBehaviors = new Map<string, Set<string>>();
  let cachedTripleCount = 0;
  let initInflight: Promise<ReasonerStatus> | null = null;

  async function ensureModule(): Promise<OxigraphModule | null> {
    if (opts.module) return opts.module;
    try {
      // Vite resolves /web for the browser via the `browser` field; Node uses
      // /node. Either exposes Store + a default init(). Let Vite process the
      // dynamic import so it can splice in the correct WASM URL via the
      // bundler's asset pipeline (with `optimizeDeps.exclude`).
      const mod = (await import("oxigraph")) as unknown as OxigraphModule;
      return mod;
    } catch (err) {
      lastError = (err as Error).message;
      log(`[oxigraph] dynamic import failed: ${lastError}`);
      return null;
    }
  }

  async function ensureInitialized(mod: OxigraphModule): Promise<void> {
    // Browser bundles need explicit init(); Node bindings don't expose one.
    if (typeof mod.default === "function") {
      await mod.default(opts.wasmUrl as unknown as undefined);
    }
  }

  return {
    async init(bundle) {
      // React strict mode + idempotent boot: short-circuit if already loaded
      // or initializing. Re-running mod.default() against an already-initialized
      // Oxigraph WASM resets its linear memory and invalidates any live Store.
      if (initInflight) return initInflight;
      if (store) return { loaded: true, triples: cachedTripleCount };

      initInflight = (async () => {
        loadedBundle = bundle;

        // Always populate the JS-side caches — these are the source of truth
        // for runtime guardrails even if Oxigraph itself fails to load.
        behaviorReqs.clear();
        archetypeComponents.clear();
        archetypeBehaviors.clear();
        for (const b of bundle.behaviors) behaviorReqs.set(b["@id"], b.required_components.slice());
        for (const a of bundle.archetypes) {
          archetypeComponents.set(a["@id"], new Set(a.components));
          archetypeBehaviors.set(a["@id"], new Set(a.behaviors));
        }

        const mod = await ensureModule();
        if (!mod) {
          return { loaded: false, triples: 0, lastError };
        }
        try {
          await ensureInitialized(mod);
        } catch (err) {
          lastError = `init: ${(err as Error).message}`;
          console.error("[oxigraph] init failed", err);
          return { loaded: false, triples: 0, lastError };
        }
        try {
          store = new mod.Store();
          const ttl = bundleToTurtle(bundle);
          store.load(ttl, { format: "text/turtle", base_iri: NS });
          cachedTripleCount = store.size;
          log(`[oxigraph] loaded bundle (${cachedTripleCount} triples)`);
          return { loaded: true, triples: cachedTripleCount };
        } catch (err) {
          lastError = (err as Error).message;
          console.error("[oxigraph] load failed", err);
          store = null;
          return { loaded: false, triples: 0, lastError };
        }
      })();
      return initInflight;
    },

    status() {
      // Don't touch WASM here — status is called every tick. Use the cached
      // count from init().
      return {
        loaded: !!store,
        triples: cachedTripleCount,
        lastError,
      };
    },

    validateBundleInvariants() {
      const issues: string[] = [];
      if (!loadedBundle) {
        issues.push("reasoner not initialized");
        return { ok: false, issues };
      }

      const componentIds = new Set(loadedBundle.components.map((c) => c["@id"]));
      const behaviorIds = new Set(loadedBundle.behaviors.map((b) => b["@id"]));
      const archetypeIds = new Set(loadedBundle.archetypes.map((a) => a["@id"]));

      // Invariant 1: every behavior's required_components reference real components.
      for (const b of loadedBundle.behaviors) {
        for (const req of b.required_components) {
          if (!componentIds.has(req)) {
            issues.push(`behavior ${b["@id"]}: required_components references unknown ${req}`);
          }
        }
      }

      // Invariant 2: every archetype's behaviors must be supported by the
      // archetype's installed components. This is the single most useful
      // build-time gate — catches shipping a Lawkeeper that has EnforcePolicy
      // but no FinancialState.
      for (const a of loadedBundle.archetypes) {
        const hasComponents = new Set(a.components);
        for (const behaviorId of a.behaviors) {
          if (!behaviorIds.has(behaviorId)) {
            issues.push(`archetype ${a["@id"]}: references unknown behavior ${behaviorId}`);
            continue;
          }
          const reqs = behaviorReqs.get(behaviorId) ?? [];
          for (const req of reqs) {
            if (!hasComponents.has(req)) {
              issues.push(
                `archetype ${a["@id"]} runs behavior ${behaviorId} which requires ${req}, but archetype lacks it`,
              );
            }
          }
        }
      }

      // Invariant 3: hierarchies reference real concepts.
      for (const h of loadedBundle.hierarchies) {
        for (const c of h.included_components) {
          if (!componentIds.has(c["@id"])) {
            issues.push(`hierarchy ${h["@id"]}: includes unknown component ${c["@id"]}`);
          }
        }
        for (const b of h.included_behaviors) {
          if (!behaviorIds.has(b["@id"])) {
            issues.push(`hierarchy ${h["@id"]}: includes unknown behavior ${b["@id"]}`);
          }
        }
      }

      // Invariant 4 (SPARQL when available): no orphan ecs:hasBehavior whose
      // target isn't an ecs:Behavior. Catches typos that the JS path may miss
      // once we move to richer transitive reasoning.
      if (store) {
        try {
          const q = `
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX ecs: <${NS}>
            SELECT ?a ?b WHERE {
              ?a ecs:hasBehavior ?b .
              FILTER NOT EXISTS { ?b rdfs:subClassOf* ecs:Behavior }
            }
          `;
          const rows = (store.query(q) as Array<Map<string, { value: string }>>) ?? [];
          for (const row of rows) {
            const a = row.get("a")?.value ?? "?";
            const b = row.get("b")?.value ?? "?";
            issues.push(`SPARQL: archetype ${a} → non-Behavior ${b}`);
          }
        } catch (err) {
          // Some bindings return non-iterables; skip silently.
          log(`[oxigraph] sparql skipped: ${(err as Error).message}`);
        }
      }

      // Make sure every spawnable archetype is present.
      for (const id of archetypeIds) if (!id.startsWith("ecs:")) {
        issues.push(`archetype id missing ecs: prefix: ${id}`);
      }

      return { ok: issues.length === 0, issues };
    },

    canArchetypeRunBehavior(archetypeId, behaviorId) {
      const components = archetypeComponents.get(archetypeId);
      const behaviors = archetypeBehaviors.get(archetypeId);
      if (!components || !behaviors) return false;
      if (!behaviors.has(behaviorId)) return false;
      const reqs = behaviorReqs.get(behaviorId) ?? [];
      return reqs.every((r) => components.has(r));
    },

    canEntityRunBehavior(entity, behaviorId) {
      const reqs = behaviorReqs.get(behaviorId) ?? [];
      const have = new Set(entity.componentKeys.map((k) => COMPONENT_KEY_TO_ID[k] ?? k));
      return reqs.every((r) => have.has(r));
    },

    componentsRequiredBy(behaviorId) {
      return (behaviorReqs.get(behaviorId) ?? []).slice();
    },
  };
}

/** Serialize a bundle as Turtle for Oxigraph ingestion. */
export function bundleToTurtle(bundle: OntologyBundle): string {
  const prefix =
    `@prefix ecs: <${NS}> .\n` +
    "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n" +
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n\n";

  const lines: string[] = [
    "ecs:Component a owl:Class .",
    "ecs:Behavior a owl:Class .",
    "ecs:Archetype a owl:Class .",
  ];

  for (const c of bundle.components as ComponentDoc[]) {
    lines.push(
      `${c["@id"]} a owl:Class ; rdfs:subClassOf ecs:Component ; rdfs:label ${JSON.stringify(c.name)} ; ecs:domain ${JSON.stringify(c.domain)} .`,
    );
  }
  for (const b of bundle.behaviors as BehaviorDoc[]) {
    const reqs = b.required_components.map((r) => `ecs:requiresComponent ${r}`).join(" ; ");
    lines.push(
      `${b["@id"]} a owl:Class ; rdfs:subClassOf ecs:Behavior ; rdfs:label ${JSON.stringify(b.name)} ; ecs:domain ${JSON.stringify(b.domain)}${reqs ? " ; " + reqs : ""} .`,
    );
  }
  for (const a of bundle.archetypes as ArchetypeDoc[]) {
    const comps = a.components.map((c) => `ecs:hasComponent ${c}`).join(" ; ");
    const bhvs = a.behaviors.map((b) => `ecs:hasBehavior ${b}`).join(" ; ");
    lines.push(
      `${a["@id"]} a owl:Class ; rdfs:subClassOf ecs:Archetype ; rdfs:label ${JSON.stringify(a.name)} ; ecs:scale ${JSON.stringify(a.scale)}${comps ? " ; " + comps : ""}${bhvs ? " ; " + bhvs : ""} .`,
    );
  }

  return prefix + lines.join("\n") + "\n";
}

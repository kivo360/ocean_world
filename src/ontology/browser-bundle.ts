// Browser-side ontology loader. Uses Vite's import.meta.glob to bundle every
// JSON-LD doc under /ontology at build time. The Node-side loader.ts uses
// fs/readdir; this is its browser-only twin.
//
// On boot the App calls loadBrowserOntology() once; the resulting registry is
// the source of truth for which archetypes can be spawned and what
// components/behaviors each one declares.

import {
  validateArchetype,
  validateBehavior,
  validateBundleIntegrity,
  validateComponent,
  validateHierarchy,
} from "./schema";
import { createRegistry, type OntologyRegistry } from "./registry";
import type {
  ArchetypeDoc,
  BehaviorDoc,
  ComponentDoc,
  Domain,
  HierarchyDoc,
  OntologyBundle,
  ValidationIssue,
} from "./types";

// .jsonld is not parsed as JSON by default. Import the raw text and parse.
// `eager: true` makes Vite inline file contents at build time so loading is sync.
const componentText = import.meta.glob("/ontology/components/*.jsonld", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const behaviorText = import.meta.glob("/ontology/behaviors/*.jsonld", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const archetypeText = import.meta.glob("/ontology/archetypes/*.jsonld", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const hierarchyText = import.meta.glob("/ontology/hierarchies/*.jsonld", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function parseAll<T>(records: Record<string, string>): T[] {
  const out: T[] = [];
  for (const [path, text] of Object.entries(records)) {
    try {
      out.push(JSON.parse(text) as T);
    } catch (err) {
      // Skip unparseable docs; they'll show up as validation issues elsewhere.
      console.warn(`[ontology] failed to parse ${path}: ${(err as Error).message}`);
    }
  }
  return out;
}

export type BrowserLoadResult = {
  bundle: OntologyBundle;
  registry: OntologyRegistry;
  issues: ValidationIssue[];
  domainCounts: Record<Domain, { components: number; behaviors: number }>;
};

export function loadBrowserOntology(): BrowserLoadResult {
  const components = parseAll<ComponentDoc>(componentText);
  const behaviors = parseAll<BehaviorDoc>(behaviorText);
  const archetypes = parseAll<ArchetypeDoc>(archetypeText);
  const hierarchies = parseAll<HierarchyDoc>(hierarchyText);

  const issues: ValidationIssue[] = [];
  for (const c of components) {
    const r = validateComponent(c);
    if (!r.ok) for (const i of r.issues) issues.push({ ...i, path: `component/${c.name ?? "?"}${i.path}` });
  }
  for (const b of behaviors) {
    const r = validateBehavior(b);
    if (!r.ok) for (const i of r.issues) issues.push({ ...i, path: `behavior/${b.name ?? "?"}${i.path}` });
  }
  for (const a of archetypes) {
    const r = validateArchetype(a);
    if (!r.ok) for (const i of r.issues) issues.push({ ...i, path: `archetype/${a.name ?? "?"}${i.path}` });
  }
  for (const h of hierarchies) {
    const r = validateHierarchy(h);
    if (!r.ok) for (const i of r.issues) issues.push({ ...i, path: `hierarchy/${h.name ?? "?"}${i.path}` });
  }
  const integrity = validateBundleIntegrity({ components, behaviors, archetypes, hierarchies });
  if (!integrity.ok) issues.push(...integrity.issues);

  const bundle: OntologyBundle = { components, behaviors, archetypes, hierarchies };
  const registry = createRegistry(bundle);

  const domainCounts = computeDomainCounts(components, behaviors);

  return { bundle, registry, issues, domainCounts };
}

const DOMAINS: readonly Domain[] = [
  "economic",
  "social",
  "cognitive",
  "governance",
  "environmental",
  "organizational",
];

function computeDomainCounts(
  components: ComponentDoc[],
  behaviors: BehaviorDoc[],
): Record<Domain, { components: number; behaviors: number }> {
  const out = {} as Record<Domain, { components: number; behaviors: number }>;
  for (const d of DOMAINS) out[d] = { components: 0, behaviors: 0 };
  for (const c of components) if (out[c.domain]) out[c.domain].components += 1;
  for (const b of behaviors) if (out[b.domain]) out[b.domain].behaviors += 1;
  return out;
}

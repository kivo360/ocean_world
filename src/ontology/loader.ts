import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  validateArchetype,
  validateBehavior,
  validateBundleIntegrity,
  validateComponent,
  validateHierarchy,
} from "./schema";
import type {
  ArchetypeDoc,
  BehaviorDoc,
  ComponentDoc,
  HierarchyDoc,
  OntologyBundle,
  ValidationIssue,
} from "./types";

export type LoadOptions = {
  strict?: boolean;
  logger?: (msg: string) => void;
};

export type LoadResult = {
  bundle: OntologyBundle;
  issues: ValidationIssue[];
};

async function readJsonDir<T>(dir: string): Promise<T[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const files = entries.filter((f) => f.endsWith(".jsonld"));
  const out: T[] = [];
  for (const file of files) {
    const text = await readFile(join(dir, file), "utf-8");
    out.push(JSON.parse(text) as T);
  }
  return out;
}

/**
 * Load the on-disk ontology bundle from an ontology/ directory.
 * Validates each document; optionally throws on any issue when strict=true.
 */
export async function loadOntology(
  ontologyDir: string,
  opts: LoadOptions = {},
): Promise<LoadResult> {
  const logger = opts.logger ?? (() => undefined);
  const issues: ValidationIssue[] = [];

  const components = await readJsonDir<ComponentDoc>(join(ontologyDir, "components"));
  const behaviors = await readJsonDir<BehaviorDoc>(join(ontologyDir, "behaviors"));
  const archetypes = await readJsonDir<ArchetypeDoc>(join(ontologyDir, "archetypes"));
  const hierarchies = await readJsonDir<HierarchyDoc>(join(ontologyDir, "hierarchies"));

  for (const c of components) {
    const result = validateComponent(c);
    if (!result.ok) {
      for (const issue of result.issues) issues.push({ ...issue, path: `component/${c.name ?? "?"}${issue.path}` });
    }
  }
  for (const b of behaviors) {
    const result = validateBehavior(b);
    if (!result.ok) {
      for (const issue of result.issues) issues.push({ ...issue, path: `behavior/${b.name ?? "?"}${issue.path}` });
    }
  }
  for (const a of archetypes) {
    const result = validateArchetype(a);
    if (!result.ok) {
      for (const issue of result.issues) issues.push({ ...issue, path: `archetype/${a.name ?? "?"}${issue.path}` });
    }
  }
  for (const h of hierarchies) {
    const result = validateHierarchy(h);
    if (!result.ok) {
      for (const issue of result.issues) issues.push({ ...issue, path: `hierarchy/${h.name ?? "?"}${issue.path}` });
    }
  }
  const integrity = validateBundleIntegrity({ components, behaviors, archetypes, hierarchies });
  if (!integrity.ok) issues.push(...integrity.issues);

  logger(
    `loaded ontology: ${components.length} components, ${behaviors.length} behaviors, ${archetypes.length} archetypes, ${hierarchies.length} hierarchies, ${issues.length} issues`,
  );

  if (opts.strict && issues.length > 0) {
    throw new Error(
      `ontology validation failed (${issues.length} issues):\n` +
        issues.map((i) => `  ${i.path}: ${i.message}`).join("\n"),
    );
  }

  return {
    bundle: { components, behaviors, archetypes, hierarchies },
    issues,
  };
}

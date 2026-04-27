// Oxigraph sidecar for formal OWL/SHACL validation. Uses the oxigraph WASM
// bindings when the package is present; becomes a no-op otherwise. This keeps
// D5 usable out of the box and only adds cost when you opt in.

import type { OntologyBundle } from "../ontology/types";

type OxigraphStore = {
  load(data: string, mediaType: string, baseIRI: string): Promise<unknown>;
  update(query: string): Promise<unknown>;
  query(query: string): unknown;
};

type OxigraphModule = { Store: new () => OxigraphStore };

let cachedStore: OxigraphStore | null = null;
let unavailable = false;

export async function loadOxigraph(): Promise<OxigraphStore | null> {
  if (cachedStore) return cachedStore;
  if (unavailable) return null;
  try {
    const mod = (await import(/* @vite-ignore */ "oxigraph")) as unknown as OxigraphModule;
    cachedStore = new mod.Store();
    return cachedStore;
  } catch {
    unavailable = true;
    return null;
  }
}

/** Emit Turtle (.ttl) for a bundle. Lightweight — enough to seed Oxigraph. */
export function bundleToTurtle(bundle: OntologyBundle): string {
  const prefix =
    "@prefix ecs: <https://ocean-world.local/ontology/> .\n" +
    "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n" +
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n\n";

  const lines: string[] = [];
  for (const c of bundle.components) {
    lines.push(`${c["@id"]} a owl:Class ;`);
    lines.push(`  rdfs:subClassOf ecs:Component ;`);
    lines.push(`  rdfs:label ${JSON.stringify(c.name)} ;`);
    lines.push(`  ecs:category ${JSON.stringify(c.category)} ;`);
    lines.push(`  ecs:domain ${JSON.stringify(c.domain)} .`);
  }
  for (const b of bundle.behaviors) {
    lines.push(`${b["@id"]} a owl:Class ;`);
    lines.push(`  rdfs:subClassOf ecs:Behavior ;`);
    lines.push(`  rdfs:label ${JSON.stringify(b.name)} ;`);
    for (const rc of b.required_components) {
      lines.push(`  ecs:requiresComponent ${rc} ;`);
    }
    lines.push(`  ecs:domain ${JSON.stringify(b.domain)} .`);
  }
  return prefix + lines.join("\n") + "\n";
}

/**
 * Quick subsumption check: does a given subject appear in the store as a
 * subclass of any of the candidate superclasses? Returns the matching parent
 * or null. Uses SPARQL ASK.
 */
export async function checkSubsumption(
  store: OxigraphStore,
  subject: string,
  candidates: string[],
): Promise<string | null> {
  for (const candidate of candidates) {
    const query = `ASK { <${subject}> <http://www.w3.org/2000/01/rdf-schema#subClassOf>+ <${candidate}> }`;
    try {
      const result = await (store.query(query) as Promise<boolean> | boolean);
      if (result) return candidate;
    } catch {
      // Some Oxigraph bindings return sync booleans. Ignore errors.
    }
  }
  return null;
}

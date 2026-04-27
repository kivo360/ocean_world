#!/usr/bin/env tsx
// Build-time ontology validator. Loads the on-disk JSON-LD bundle, runs both:
//   1. The schema/integrity validators (already invoked by loadOntology)
//   2. The Oxigraph reasoner (cross-document SPARQL invariants + the
//      "archetype must support behavior" rule that the JS-side check enforces
//      explicitly).
//
// Exits non-zero on any issue. Wired from `npm run ontology:validate` and
// from `npm run build` so a broken ontology can never ship.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadOntology } from "../src/ontology";
import { createOntologyReasoner } from "../src/ontology/oxigraph-reasoner";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ontologyDir = resolve(projectRoot, "ontology");

const { bundle, issues } = await loadOntology(ontologyDir, {
  strict: false,
  logger: (m) => console.log(m),
});

console.log(
  `loaded: ${bundle.components.length} components, ${bundle.behaviors.length} behaviors, ${bundle.archetypes.length} archetypes`,
);

let exit = 0;
if (issues.length > 0) {
  console.error("\nschema/integrity issues:");
  for (const i of issues) console.error(`  - ${i.path}: ${i.message}`);
  exit = 1;
}

const reasoner = createOntologyReasoner({ logger: (m) => console.log(m) });
const status = await reasoner.init(bundle);
if (!status.loaded) {
  console.warn(
    `oxigraph not available (${status.lastError ?? "unknown"}); falling back to JS-only invariants`,
  );
} else {
  console.log(`oxigraph: loaded ${status.triples} triples`);
}

const report = reasoner.validateBundleInvariants();
if (!report.ok) {
  console.error(`\nontology invariants failed (${report.issues.length}):`);
  for (const i of report.issues) console.error(`  - ${i}`);
  exit = 1;
} else {
  console.log("ontology invariants: OK");
}

if (exit !== 0) {
  console.error("\nvalidation failed.");
  process.exit(exit);
}
console.log("\nvalidation OK.");

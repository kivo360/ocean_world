#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadOntology, writeGeneratedOntology } from "../src/ontology";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ontologyDir = resolve(projectRoot, "ontology");
const outDir = resolve(ontologyDir, "generated");

const { bundle, issues } = await loadOntology(ontologyDir, { strict: true });
await writeGeneratedOntology(bundle, outDir);
console.log(
  `codegen: wrote ${bundle.components.length} components, ${bundle.behaviors.length} behaviors, ${bundle.archetypes.length} archetypes to ${outDir} (${issues.length} issues)`,
);

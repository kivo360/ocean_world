#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadOntology, writeGeneratedOntology } from "../src/ontology";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ontologyDir = resolve(projectRoot, "ontology");
const outDir = resolve(ontologyDir, "generated");
const snapshotsDir = resolve(ontologyDir, "snapshots");

const { bundle, issues } = await loadOntology(ontologyDir, { strict: true });
await writeGeneratedOntology(bundle, outDir);
console.log(
  `codegen: wrote ${bundle.components.length} components, ${bundle.behaviors.length} behaviors, ${bundle.archetypes.length} archetypes to ${outDir} (${issues.length} issues)`,
);

await mkdir(snapshotsDir, { recursive: true });

const bundleJson = JSON.stringify(bundle, null, 2);
const hash = createHash("sha256").update(bundleJson).digest("hex").slice(0, 8);
const isoDate = new Date().toISOString().split("T")[0];
const snapshotFileName = `${isoDate}-${hash}.json`;
const snapshotPath = resolve(snapshotsDir, snapshotFileName);

await writeFile(snapshotPath, bundleJson);
console.log(`codegen: wrote snapshot ${snapshotFileName}`);

const snapshotFiles = await readdir(snapshotsDir);
const snapshotStats = await Promise.all(
  snapshotFiles
    .filter((f) => f.endsWith(".json"))
    .map(async (file) => {
      const filePath = resolve(snapshotsDir, file);
      const stats = await stat(filePath);
      return { file, filePath, mtime: stats.mtime };
    }),
);

if (snapshotStats.length > 50) {
  const sortedByDate = snapshotStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
  const toDelete = sortedByDate.slice(0, snapshotStats.length - 50);
  await Promise.all(toDelete.map((s) => unlink(s.filePath)));
  console.log(`codegen: pruned ${toDelete.length} old snapshots`);
}

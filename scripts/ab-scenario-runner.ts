#!/usr/bin/env tsx
// A/B scenario runner: compare two T3 configurations on the same scenario
//
// Usage:
//   npx tsx scripts/ab-scenario-runner.ts --seed 1337 --ticks 50 --scenario small-village
//   npx tsx scripts/ab-scenario-runner.ts --seed 1337 --ticks 50 --config-a config/a.json --config-b config/b.json
//
// Arguments:
//   --seed N           (default 1337)
//   --ticks N          (default 50)
//   --scenario NAME    (default small-village)
//   --config-a PATH    (optional, T3 config for world A)
//   --config-b PATH    (optional, T3 config for world B)
//   --output PATH      (default .sisyphus/evidence/tooling/task-t13-ab-run.txt)

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { smallVillage, type ScenarioOptions } from "../src/scenarios/small-village";
import { resetEntityCounter } from "../src/simulation/archetypes";
import { runTick } from "../src/simulation/tick";
import { snapshot, type World } from "../src/simulation/world";
import { REGISTRY } from "../src/behaviors/registry";

const args = new Map<string, string>();
const flags = new Set<string>();
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--")) {
    const eq = arg.indexOf("=");
    if (eq > 0) {
      args.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else {
      const next = process.argv[process.argv.indexOf(arg) + 1];
      if (next && !next.startsWith("--")) args.set(arg.slice(2), next);
      else flags.add(arg.slice(2));
    }
  }
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Parse arguments
const seed = Number(args.get("seed") ?? 1337);
const ticks = Number(args.get("ticks") ?? 50);
const scenario = args.get("scenario") ?? "small-village";
const configA = args.get("config-a");
const configB = args.get("config-b");
const outputPath = args.get("output") ?? ".sisyphus/evidence/tooling/task-t13-ab-run.txt";

// Build scenario options
const scenarioOpts: ScenarioOptions = {
  seed,
  personCount: 60,
  merchantCount: 6,
  wandererCount: 18,
  marketMakerCount: 3,
  lawkeeperCount: 2,
};

console.log(`A/B Scenario Runner`);
console.log(`===================`);
console.log(`Seed: ${seed}`);
console.log(`Ticks: ${ticks}`);
console.log(`Scenario: ${scenario}`);
console.log(`Config A: ${configA ?? "(default)"}`);
console.log(`Config B: ${configB ?? "(default)"}`);
console.log();

// Build World A
console.log("[A] Building world...");
const worldA = smallVillage(scenarioOpts);
console.log(`[A] Created world with ${worldA.entities.size} entities`);

// CRITICAL: Reset entity counter between worlds for deterministic comparison
resetEntityCounter();

// Build World B
console.log("[B] Building world...");
const worldB = smallVillage(scenarioOpts);
console.log(`[B] Created world with ${worldB.entities.size} entities`);

// TODO: Apply different T3 configs if provided
// For now, both worlds use the same config to verify determinism
if (configA || configB) {
  console.log("[NOTE] Custom T3 configs not yet implemented - using default for both worlds");
}

// Run ticks
console.log();
console.log(`Running ${ticks} ticks...`);
for (let i = 0; i < ticks; i++) {
  runTick(worldA, REGISTRY);
  runTick(worldB, REGISTRY);
  if ((i + 1) % 10 === 0 || i === ticks - 1) {
    process.stdout.write(`\rProgress: ${i + 1}/${ticks} ticks`);
  }
}
console.log();
console.log();

// Capture snapshots
const snapA = snapshot(worldA);
const snapB = snapshot(worldB);

// Compare snapshots
console.log("Comparing snapshots...");
console.log();

// Entity counts by archetype
function countByArchetype(snap: typeof snapA) {
  const counts = new Map<string, number>();
  for (const e of snap) {
    counts.set(e.archetype, (counts.get(e.archetype) ?? 0) + 1);
  }
  return counts;
}

const countsA = countByArchetype(snapA);
const countsB = countByArchetype(snapB);

// Event counts
const eventsA = worldA.events;
const eventsB = worldB.events;

function countEventsByKind(events: typeof eventsA) {
  const counts = new Map<string, number>();
  for (const e of events) {
    counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  }
  return counts;
}

const eventCountsA = countEventsByKind(eventsA);
const eventCountsB = countEventsByKind(eventsB);

// Position comparison
interface PositionDiff {
  id: string;
  name: string;
  archetype: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  dist: number;
}

const positionDiffs: PositionDiff[] = [];
for (const ea of snapA) {
  const eb = snapB.find((e) => e.id === ea.id);
  if (eb) {
    const dx = ea.x - eb.x;
    const dy = ea.y - eb.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.001) {
      positionDiffs.push({
        id: ea.id,
        name: ea.name,
        archetype: ea.archetype,
        ax: ea.x,
        ay: ea.y,
        bx: eb.x,
        by: eb.y,
        dist,
      });
    }
  }
}

// Sort by distance descending
positionDiffs.sort((a, b) => b.dist - a.dist);

// Build report
const report: string[] = [];
report.push("A/B Scenario Runner Report");
report.push("==========================");
report.push(`Seed: ${seed}`);
report.push(`Ticks: ${ticks}`);
report.push(`Scenario: ${scenario}`);
report.push(`Config A: ${configA ?? "(default)"}`);
report.push(`Config B: ${configB ?? "(default)"}`);
report.push("");

// Entity counts
report.push("Entity Counts by Archetype");
report.push("--------------------------");
const allArchetypes = new Set([...countsA.keys(), ...countsB.keys()]);
for (const archetype of allArchetypes) {
  const ca = countsA.get(archetype) ?? 0;
  const cb = countsB.get(archetype) ?? 0;
  const match = ca === cb ? "✓" : "✗";
  report.push(`${match} ${archetype}: A=${ca}, B=${cb}`);
}
report.push("");

// Event counts
report.push("Event Counts by Kind");
report.push("--------------------");
const allEventKinds = new Set([...eventCountsA.keys(), ...eventCountsB.keys()]);
for (const kind of allEventKinds) {
  const ca = eventCountsA.get(kind) ?? 0;
  const cb = eventCountsB.get(kind) ?? 0;
  const match = ca === cb ? "✓" : "✗";
  report.push(`${match} ${kind}: A=${ca}, B=${cb}`);
}
report.push("");

// T3 deliberation stats
report.push("T3 Deliberation Stats");
report.push("---------------------");
report.push(`World A: ${worldA.deliberations.length} records`);
report.push(`World B: ${worldB.deliberations.length} records`);
report.push(`Match: ${worldA.deliberations.length === worldB.deliberations.length ? "✓" : "✗"}`);
report.push("");

// Policy violations
report.push("Policy Violations");
report.push("-----------------");
report.push(`World A: ${worldA.policyViolations}`);
report.push(`World B: ${worldB.policyViolations}`);
report.push(`Match: ${worldA.policyViolations === worldB.policyViolations ? "✓" : "✗"}`);
report.push("");

// Position differences
report.push("Position Differences (Top 10)");
report.push("-------------------------------");
if (positionDiffs.length === 0) {
  report.push("✓ No position differences - worlds are identical!");
} else {
  report.push(`Found ${positionDiffs.length} entities with different positions`);
  report.push("");
  for (const diff of positionDiffs.slice(0, 10)) {
    report.push(`  ${diff.name} (${diff.archetype}):`);
    report.push(`    A: (${diff.ax.toFixed(3)}, ${diff.ay.toFixed(3)})`);
    report.push(`    B: (${diff.bx.toFixed(3)}, ${diff.by.toFixed(3)})`);
    report.push(`    Distance: ${diff.dist.toFixed(3)}`);
  }
  if (positionDiffs.length > 10) {
    report.push(`  ... and ${positionDiffs.length - 10} more`);
  }
}
report.push("");

// Summary
const totalEntitiesMatch = snapA.length === snapB.length;
const allCountsMatch = [...allArchetypes].every((a) => countsA.get(a) === countsB.get(a));
const allEventsMatch = [...allEventKinds].every((k) => eventCountsA.get(k) === eventCountsB.get(k));
const positionsMatch = positionDiffs.length === 0;
const deliberationsMatch = worldA.deliberations.length === worldB.deliberations.length;
const violationsMatch = worldA.policyViolations === worldB.policyViolations;

report.push("Summary");
report.push("-------");
report.push(`Total entities match: ${totalEntitiesMatch ? "✓ PASS" : "✗ FAIL"}`);
report.push(`Entity counts by archetype match: ${allCountsMatch ? "✓ PASS" : "✗ FAIL"}`);
report.push(`Event counts match: ${allEventsMatch ? "✓ PASS" : "✗ FAIL"}`);
report.push(`Positions match: ${positionsMatch ? "✓ PASS" : "✗ FAIL"}`);
report.push(`T3 deliberations match: ${deliberationsMatch ? "✓ PASS" : "✗ FAIL"}`);
report.push(`Policy violations match: ${violationsMatch ? "✓ PASS" : "✗ FAIL"}`);
report.push("");

const allMatch = totalEntitiesMatch && allCountsMatch && allEventsMatch && positionsMatch && deliberationsMatch && violationsMatch;
report.push(`Overall: ${allMatch ? "✓ DETERMINISTIC - All checks passed" : "✗ DIFFERENCES DETECTED"}`);

const reportText = report.join("\n");

// Print to stdout
console.log(reportText);
console.log();

// Write to file
const fullOutputPath = resolve(projectRoot, outputPath);
await mkdir(dirname(fullOutputPath), { recursive: true });
await writeFile(fullOutputPath, reportText + "\n");
console.log(`Report saved to: ${outputPath}`);

// Exit with appropriate code
process.exit(allMatch ? 0 : 1);

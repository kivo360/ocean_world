#!/usr/bin/env tsx
// Run the ontology builder against the on-disk bundle. Writes accepted
// candidates back as JSON-LD files under ontology/generated/runtime/ for
// inspection. Regenerates the generated TS types when done.
//
// Usage:
//   npm run ontology:build -- --rounds 5 --dry-run
// Flags:
//   --rounds N         (default 5)
//   --batch N          (default 4)
//   --dry-run          don't write accepted candidates
//   --evolve           run the D6 evolve loop instead (observer → orchestrator)
//   --cycles N         (default 3, evolve mode only)
//   --ticks N          ticks per cycle (default 80)

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createRegistry, loadOntology, writeGeneratedOntology } from "../src/ontology";
import { runOrchestrator, DEFAULT_TARGETS } from "../src/orchestrator";
import { runEvolveLoop } from "../src/observer";
import { InMemoryRepository } from "../src/storage/in-memory-repo";

// The sandbox-agent SDK streams ACP events via background fetches we don't
// await. A transient network hiccup on that stream surfaces as an unhandled
// rejection (HeadersTimeoutError, ECONNRESET, etc.). Log and keep the evolve
// loop alive — the foreground awaits in SandboxAgentObserver / Critic already
// fall back gracefully when their own requests fail.
process.on("unhandledRejection", (reason) => {
  const err = reason as { code?: string; cause?: { code?: string }; message?: string };
  const code = err?.code ?? err?.cause?.code ?? "";
  const transient = code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_SOCKET" || code === "ECONNRESET";
  if (transient) {
    console.warn(`[evolve] ignoring transient sandbox-agent error: ${err?.message ?? code}`);
    return;
  }
  console.error("[evolve] unhandled rejection:", reason);
});

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
const ontologyDir = resolve(projectRoot, "ontology");
const outDir = resolve(ontologyDir, "generated", "runtime");

const { bundle, issues } = await loadOntology(ontologyDir, { strict: true });
if (issues.length > 0) {
  console.warn("warning: ontology has", issues.length, "issues on load");
}
const registry = createRegistry(bundle);

const providers = {
  proposer: process.env.FIREWORKS_API_KEY
    ? "Fireworks"
    : process.env.ANTHROPIC_API_KEY
      ? "Anthropic"
      : "stub",
  embeddings: process.env.FIREWORKS_API_KEY
    ? "Fireworks"
    : process.env.OPENAI_API_KEY
      ? "OpenAI"
      : "stub",
  critic: process.env.SANDBOX_AGENT_URL
    ? "Sandbox Agent"
    : process.env.ANTHROPIC_API_KEY
      ? "Anthropic"
      : "stub",
  observer: process.env.SANDBOX_AGENT_URL
    ? "Sandbox Agent"
    : process.env.ANTHROPIC_API_KEY
      ? "Anthropic"
      : "deterministic",
};
console.log("providers:", providers);

const dryRun = flags.has("dry-run");
const evolve = flags.has("evolve");
const rounds = Number(args.get("rounds") ?? 5);
const batch = Number(args.get("batch") ?? 4);

if (evolve) {
  const cycles = Number(args.get("cycles") ?? 3);
  const ticks = Number(args.get("ticks") ?? 80);
  const repo = new InMemoryRepository({
    seed: 777,
    initialPersons: 30,
    initialMerchants: 4,
    initialWanderers: 8,
  });
  await repo.init();
  const report = await runEvolveLoop(repo, registry, {
    cycles,
    ticksPerCycle: ticks,
    orchestratorOptions: {
      targets: DEFAULT_TARGETS,
      budget: { maxRounds: rounds, maxLlmCalls: 1000, maxAcceptances: 60 },
      batchSize: batch,
      ragOptions: { seedsDir: resolve(ontologyDir, "seeds") },
      logger: (m) => console.log(`[orch] ${m}`),
    },
    logger: (m) => console.log(`[evolve] ${m}`),
  });
  console.log("\n=== evolve report ===");
  for (const c of report.cycles) {
    console.log(
      `cycle ${c.cycle}: ticks ${c.startTick}-${c.endTick}, signals=${c.gapReport.signals.length}, accepted=${c.orchestratorReport.accepted.length}`,
    );
  }
  console.log("final registry counts:", report.finalRegistryCounts);
} else {
  const report = await runOrchestrator(registry, {
    targets: DEFAULT_TARGETS,
    budget: { maxRounds: rounds, maxLlmCalls: 1000, maxAcceptances: 40 },
    batchSize: batch,
    ragOptions: { seedsDir: resolve(ontologyDir, "seeds") },
    logger: (m) => console.log(`[orch] ${m}`),
  });
  console.log(
    `accepted: ${report.accepted.length}, rejected: ${report.rejected.length}, merged: ${report.merged.length}, rounds: ${report.rounds}, llmCalls: ${report.llmCalls}`,
  );
  console.log(`stopped: ${report.stoppedReason}`);
}

if (!dryRun) {
  await mkdir(outDir, { recursive: true });
  const finalBundle = registry.getBundle();
  for (const c of finalBundle.components) {
    await writeFile(resolve(outDir, `component-${c.name}.jsonld`), JSON.stringify(c, null, 2) + "\n");
  }
  await writeGeneratedOntology(finalBundle, resolve(ontologyDir, "generated"));
  console.log(`wrote runtime ontology + regenerated TS types to ${ontologyDir}/generated`);
}

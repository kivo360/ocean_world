import type { OntologyRegistry } from "../ontology/registry";
import type { Domain } from "../ontology/types";
import { runOrchestrator, type OrchestratorOptions } from "../orchestrator";
import type { OrchestratorReport } from "../orchestrator";
import { DEFAULT_TARGETS } from "../orchestrator/domain-queue";
import type { Repository } from "../storage/repository";
import { createObserver, type ObserverClient } from "./observer-agent";
import type { GapReport } from "./types";

export type EvolveOptions = {
  ticksPerCycle?: number;
  cycles?: number;
  observer?: ObserverClient;
  orchestratorOptions?: OrchestratorOptions;
  logger?: (msg: string) => void;
};

export type EvolveCycleResult = {
  cycle: number;
  startTick: number;
  endTick: number;
  gapReport: GapReport;
  orchestratorReport: OrchestratorReport;
};

export type EvolveReport = {
  cycles: EvolveCycleResult[];
  finalStats: Awaited<ReturnType<Repository["stats"]>>;
  finalRegistryCounts: ReturnType<OntologyRegistry["counts"]>;
};

/**
 * Full D6 loop:
 *   1) run scenario for N ticks
 *   2) observer produces GapReport
 *   3) domain pressure adjusts proposer targets
 *   4) orchestrator run fills the gap
 *   5) loop
 *
 * The loop is budget-bounded by `cycles` and by the orchestratorOptions.budget
 * on each inner run.
 */
export async function runEvolveLoop(
  repo: Repository,
  registry: OntologyRegistry,
  opts: EvolveOptions = {},
): Promise<EvolveReport> {
  const cyclesCount = opts.cycles ?? 3;
  const ticksPerCycle = opts.ticksPerCycle ?? 80;
  const observer = opts.observer ?? createObserver();
  const log = opts.logger ?? (() => undefined);

  const cycles: EvolveCycleResult[] = [];
  let baseTargets = { ...(opts.orchestratorOptions?.targets ?? DEFAULT_TARGETS) };

  for (let i = 0; i < cyclesCount; i++) {
    const startTick = await repo.getTick();
    await repo.advanceTick(ticksPerCycle);
    const endTick = await repo.getTick();
    log(`cycle ${i + 1}: ran ticks ${startTick}–${endTick}`);

    const gapReport = await observer.observe({ repo, registry, sinceTick: startTick, endTick });
    log(`cycle ${i + 1}: observer produced ${gapReport.signals.length} signals`);

    // Bump targets for domains under pressure.
    const adjusted = adjustTargets(baseTargets, gapReport.domainPressure);
    baseTargets = adjusted;

    const orchestratorReport = await runOrchestrator(registry, {
      ...opts.orchestratorOptions,
      targets: adjusted,
      logger: opts.logger,
    });
    log(
      `cycle ${i + 1}: orchestrator accepted=${orchestratorReport.accepted.length} rejected=${orchestratorReport.rejected.length} merged=${orchestratorReport.merged.length}`,
    );

    cycles.push({ cycle: i + 1, startTick, endTick, gapReport, orchestratorReport });
  }

  return {
    cycles,
    finalStats: await repo.stats(),
    finalRegistryCounts: registry.counts(),
  };
}

function adjustTargets(
  base: Record<Domain, number>,
  pressure: Partial<Record<Domain, number>>,
): Record<Domain, number> {
  const out = { ...base };
  for (const [domain, weight] of Object.entries(pressure) as Array<[Domain, number]>) {
    if (!weight) continue;
    // Bump target by +1 per unit of pressure, capped at +5 per cycle.
    const bump = Math.min(5, Math.round(weight));
    out[domain] = (out[domain] ?? 0) + bump;
  }
  return out;
}

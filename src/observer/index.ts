export {
  detectStuckEntities,
  detectRepeatedFailures,
  detectOrphanComponents,
  detectInactiveBehaviors,
  detectLowInteractionDiversity,
  collectAllSignals,
  computeDomainPressure,
} from "./gap-detectors";
export type { DetectorContext } from "./gap-detectors";
export {
  DeterministicObserver,
  AnthropicObserver,
  SandboxAgentObserver,
  createObserver,
} from "./observer-agent";
export type { ObserverClient, ObserverConfig } from "./observer-agent";
export { runEvolveLoop } from "./evolve-loop";
export type { EvolveOptions, EvolveCycleResult, EvolveReport } from "./evolve-loop";
export type { GapReport, GapSignal } from "./types";

import type { OntologyRegistry } from "../ontology/registry";
import type { Domain } from "../ontology/types";
import type { DomainStatus, Strategy } from "./types";

export const DEFAULT_TARGETS: Record<Domain, number> = {
  economic: 20,
  social: 18,
  cognitive: 15,
  governance: 12,
  environmental: 10,
  organizational: 15,
};

export function pickStrategy(fillRatio: number): Strategy {
  if (fillRatio < 0.3) return "broad_survey";
  if (fillRatio < 0.7) return "gap_fill";
  return "specialization";
}

/**
 * Domain queue: sorts domains by sparsest-first, breaking ties by staleness
 * (number of rounds since we last ran this domain). The queue is rebuilt every
 * round so accept/reject counts immediately influence ordering.
 */
export class DomainQueue {
  private staleness: Map<Domain, number> = new Map();
  private acceptsByDomain: Map<Domain, number> = new Map();
  private attemptsByDomain: Map<Domain, number> = new Map();
  private consecutiveLowAcceptRounds: Map<Domain, number> = new Map();
  private softStopped: Set<Domain> = new Set();

  constructor(
    private readonly registry: OntologyRegistry,
    private readonly targets: Record<Domain, number> = DEFAULT_TARGETS,
  ) {
    for (const d of Object.keys(targets) as Domain[]) {
      this.staleness.set(d, 0);
      this.acceptsByDomain.set(d, 0);
      this.attemptsByDomain.set(d, 0);
      this.consecutiveLowAcceptRounds.set(d, 0);
    }
  }

  snapshot(): DomainStatus[] {
    const ratios = this.registry.fillRatios(this.targets);
    return (Object.keys(this.targets) as Domain[]).map((domain) => {
      const attempts = this.attemptsByDomain.get(domain) ?? 0;
      const accepts = this.acceptsByDomain.get(domain) ?? 0;
      return {
        domain,
        target: this.targets[domain]!,
        filled: Math.round((ratios[domain] ?? 0) * (this.targets[domain] ?? 0)),
        fillRatio: ratios[domain] ?? 0,
        staleness: this.staleness.get(domain) ?? 0,
        strategy: pickStrategy(ratios[domain] ?? 0),
        acceptanceRate: attempts === 0 ? 1 : accepts / attempts,
        softStopped: this.softStopped.has(domain),
      };
    });
  }

  /** Pick the next domain to process. Returns null if all soft-stopped. */
  pick(): Domain | null {
    const statuses = this.snapshot().filter((s) => !s.softStopped);
    if (statuses.length === 0) return null;
    statuses.sort((a, b) => {
      if (a.fillRatio !== b.fillRatio) return a.fillRatio - b.fillRatio;
      return b.staleness - a.staleness;
    });
    return statuses[0]!.domain;
  }

  /** Called after a round completes to update counters. */
  recordRound(domain: Domain, accepted: number, attempted: number): void {
    this.attemptsByDomain.set(domain, (this.attemptsByDomain.get(domain) ?? 0) + attempted);
    this.acceptsByDomain.set(domain, (this.acceptsByDomain.get(domain) ?? 0) + accepted);
    this.staleness.set(domain, 0);
    for (const d of this.staleness.keys()) {
      if (d !== domain) this.staleness.set(d, (this.staleness.get(d) ?? 0) + 1);
    }
    // Soft-stop rule per docs/04: acceptance rate < 0.2 for 3 consecutive rounds.
    const rate = attempted === 0 ? 1 : accepted / attempted;
    if (rate < 0.2) {
      const curr = (this.consecutiveLowAcceptRounds.get(domain) ?? 0) + 1;
      this.consecutiveLowAcceptRounds.set(domain, curr);
      if (curr >= 3) this.softStopped.add(domain);
    } else {
      this.consecutiveLowAcceptRounds.set(domain, 0);
    }

    // Also soft-stop if the domain is already over target by 20%.
    const ratios = this.registry.fillRatios(this.targets);
    if ((ratios[domain] ?? 0) >= 1.2) this.softStopped.add(domain);
  }

  reopenDomain(domain: Domain): void {
    this.softStopped.delete(domain);
    this.consecutiveLowAcceptRounds.set(domain, 0);
  }

  allSoftStopped(): boolean {
    return (Object.keys(this.targets) as Domain[]).every((d) => this.softStopped.has(d));
  }
}

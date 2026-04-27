import type { CandidateKind } from "./types";
import type { Domain } from "../ontology/types";

export type RejectedEntry = {
  name: string;
  kind: CandidateKind;
  domain: Domain;
  reason: string;
  rejectedAt: number; // round number
};

/**
 * In-memory rejection log that suppresses repeated proposals of the same name
 * and surfaces recent rejections back into the proposer's RAG context.
 */
export class RejectedStore {
  private entries: RejectedEntry[] = [];

  record(entry: RejectedEntry): void {
    this.entries.push(entry);
    if (this.entries.length > 500) this.entries.splice(0, this.entries.length - 500);
  }

  has(name: string): boolean {
    return this.entries.some((e) => e.name === name);
  }

  recentInDomain(domain: Domain, limit: number): RejectedEntry[] {
    return this.entries
      .filter((e) => e.domain === domain)
      .slice(-limit)
      .reverse();
  }

  all(): RejectedEntry[] {
    return [...this.entries];
  }
}

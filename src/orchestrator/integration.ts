import type { OntologyRegistry } from "../ontology/registry";
import type { Candidate, CandidateKind } from "./types";

export type IntegrationResult = {
  accepted: boolean;
  newIds: string[];
};

/**
 * Topologically sort: components first, then behaviors, then archetypes.
 * This lets intra-batch dependencies satisfy themselves.
 */
export function topologicalSort(candidates: Candidate[]): Candidate[] {
  const rank: Record<CandidateKind, number> = {
    component: 0,
    behavior: 1,
    archetype: 2,
  };
  return [...candidates].sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export function integrate(registry: OntologyRegistry, candidate: Candidate): IntegrationResult {
  switch (candidate.kind) {
    case "component":
      registry.addComponent(candidate.data);
      return { accepted: true, newIds: [candidate.data["@id"]] };
    case "behavior":
      registry.addBehavior(candidate.data);
      return { accepted: true, newIds: [candidate.data["@id"]] };
    case "archetype":
      registry.addArchetype(candidate.data);
      return { accepted: true, newIds: [candidate.data["@id"]] };
  }
}

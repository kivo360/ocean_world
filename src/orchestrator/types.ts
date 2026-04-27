import type {
  ArchetypeDoc,
  BehaviorDoc,
  ComponentDoc,
  Domain,
} from "../ontology/types";

export type Strategy = "broad_survey" | "gap_fill" | "specialization";

export type DomainStatus = {
  domain: Domain;
  target: number;
  filled: number;
  fillRatio: number;
  staleness: number;
  strategy: Strategy;
  acceptanceRate: number;
  softStopped: boolean;
};

export type CandidateKind = "component" | "behavior" | "archetype";

export type Candidate =
  | { kind: "component"; name: string; domain: Domain; description: string; data: ComponentDoc }
  | { kind: "behavior"; name: string; domain: Domain; description: string; data: BehaviorDoc }
  | { kind: "archetype"; name: string; domain: Domain; description: string; data: ArchetypeDoc };

export type ProposerBatch = {
  candidates: Candidate[];
  reasoning: string;
};

export type VerdictZone = "novel" | "deliberation" | "duplicate";

export type Verdict = {
  decision: "accept" | "reject" | "merge";
  reason: string;
  zone: VerdictZone;
  mergeTargetId?: string;
  gateFailures: string[];
};

export type GateContext = {
  domain: Domain;
  knownIds: Set<string>;
  knownNames: Set<string>;
};

export type RAGContext = {
  domain: Domain;
  strategy: Strategy;
  existing: Array<ComponentDoc | BehaviorDoc>;
  siblings: Array<ComponentDoc | BehaviorDoc>;
  rejected: Array<{ name: string; kind: CandidateKind; reason: string }>;
  seeds: {
    domains: string;
    schemaOrgActions: string;
    verbnetClasses: string;
  };
};

export type OrchestratorBudget = {
  maxRounds: number;
  maxLlmCalls: number;
  maxAcceptances: number;
};

export type OrchestratorProgress = {
  round: number;
  domain: Domain;
  strategy: Strategy;
  accepted: number;
  rejected: number;
  merged: number;
  llmCalls: number;
};

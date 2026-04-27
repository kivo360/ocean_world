import type { Domain } from "../ontology/types";

export type GapSignal = {
  kind:
    | "stuck_entity"
    | "repeated_failed_action"
    | "low_interaction_diversity"
    | "orphan_component"
    | "inactive_behavior"
    | "unbalanced_values";
  severity: "low" | "medium" | "high";
  domain: Domain;
  evidence: string;
  entities?: string[];
  suggestion: string;
};

export type GapReport = {
  sinceTick: number;
  endTick: number;
  signals: GapSignal[];
  domainPressure: Partial<Record<Domain, number>>;
};

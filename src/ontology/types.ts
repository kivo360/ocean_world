// Structural types mirroring JSON-LD ontology documents.
// We don't try to model every RDF/OWL predicate — only the fields ECS needs.

export type Domain =
  | "economic"
  | "social"
  | "cognitive"
  | "governance"
  | "environmental"
  | "organizational";

export type ComponentCategory = "state" | "resource" | "relation" | "capability";

export type FieldDef = {
  name: string;
  type: string;
  range?: [number | null, number | null];
};

export type ComponentDoc = {
  "@id": string;
  name: string;
  category: ComponentCategory;
  domain: Domain;
  description: string;
  fields: FieldDef[];
  composable_with?: string[];
  broader?: string;
};

export type ActionDef = {
  name: string;
  input?: Record<string, string>;
  preconditions?: string[];
  effects?: string[];
};

export type StateMachineDef = {
  states: string[];
  initial: string;
  transitions: Array<{ from: string; to: string; on: string }>;
};

export type BehaviorDoc = {
  "@id": string;
  name: string;
  domain: Domain;
  description: string;
  required_components: string[];
  reads?: string[];
  writes?: string[];
  actions: ActionDef[];
  state_machine: StateMachineDef;
};

export type ArchetypeDoc = {
  "@id": string;
  name: string;
  scale: "micro" | "meso" | "macro";
  description?: string;
  components: string[];
  behaviors: string[];
};

export type HierarchyDoc = {
  "@id": string;
  name: string;
  purpose: string;
  root: string;
  included_components: Array<{ "@id": string; relevance: number; role: string }>;
  included_behaviors: Array<{ "@id": string; relevance: number; role: string }>;
  excluded?: string[];
  composition_metadata?: {
    pruning_threshold: number;
    total_concepts: number;
    coverage_score: number;
  };
};

export type OntologyBundle = {
  components: ComponentDoc[];
  behaviors: BehaviorDoc[];
  archetypes: ArchetypeDoc[];
  hierarchies: HierarchyDoc[];
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

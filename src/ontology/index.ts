export { loadOntology } from "./loader";
export type { LoadOptions, LoadResult } from "./loader";
export {
  validateComponent,
  validateBehavior,
  validateArchetype,
  validateHierarchy,
  validateBundleIntegrity,
} from "./schema";
export {
  generateComponentTypes,
  generateBehaviorMeta,
  generateArchetypeMeta,
  writeGeneratedOntology,
} from "./codegen";
export { prune, suggestMerges, scoreConcept } from "./hierarchy";
export type { ConceptScore, PrunedHierarchy } from "./hierarchy";
export { createRegistry } from "./registry";
export type { OntologyRegistry } from "./registry";
export type {
  ArchetypeDoc,
  BehaviorDoc,
  ComponentDoc,
  Domain,
  HierarchyDoc,
  OntologyBundle,
  ValidationIssue,
  ValidationResult,
  FieldDef,
  ActionDef,
  StateMachineDef,
  ComponentCategory,
} from "./types";

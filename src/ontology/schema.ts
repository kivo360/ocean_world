import type {
  ArchetypeDoc,
  BehaviorDoc,
  ComponentDoc,
  Domain,
  HierarchyDoc,
  ValidationIssue,
  ValidationResult,
} from "./types";

const DOMAINS: ReadonlySet<Domain> = new Set([
  "economic",
  "social",
  "cognitive",
  "governance",
  "environmental",
  "organizational",
]);

const COMPONENT_CATEGORIES = new Set(["state", "resource", "relation", "capability"]);
const ARCHETYPE_SCALES = new Set(["micro", "meso", "macro"]);

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateComponent(doc: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(doc)) return { ok: false, issues: [issue("/", "not an object")] };
  if (typeof doc.name !== "string" || !doc.name) issues.push(issue("/name", "required string"));
  if (!DOMAINS.has(doc.domain as Domain)) issues.push(issue("/domain", `invalid: ${String(doc.domain)}`));
  if (!COMPONENT_CATEGORIES.has(doc.category as string)) {
    issues.push(issue("/category", `invalid: ${String(doc.category)}`));
  }
  if (typeof doc.description !== "string" || !doc.description)
    issues.push(issue("/description", "required non-empty string"));
  if (!Array.isArray(doc.fields)) {
    issues.push(issue("/fields", "must be an array"));
  } else {
    if (doc.fields.length < 1 || doc.fields.length > 8) {
      issues.push(issue("/fields", `must have 1–8 fields (has ${doc.fields.length})`));
    }
    doc.fields.forEach((f, i) => {
      if (!isObject(f)) return issues.push(issue(`/fields/${i}`, "not an object"));
      if (typeof f.name !== "string" || !f.name)
        issues.push(issue(`/fields/${i}/name`, "required string"));
      if (typeof f.type !== "string" || !f.type)
        issues.push(issue(`/fields/${i}/type`, "required string"));
    });
  }
  if (doc.composable_with !== undefined && !isStringArray(doc.composable_with)) {
    issues.push(issue("/composable_with", "must be string array if present"));
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function validateBehavior(doc: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(doc)) return { ok: false, issues: [issue("/", "not an object")] };
  if (typeof doc.name !== "string" || !doc.name) issues.push(issue("/name", "required string"));
  if (!DOMAINS.has(doc.domain as Domain)) issues.push(issue("/domain", `invalid: ${String(doc.domain)}`));
  if (typeof doc.description !== "string" || !doc.description)
    issues.push(issue("/description", "required non-empty string"));
  if (!isStringArray(doc.required_components) || doc.required_components.length === 0) {
    issues.push(issue("/required_components", "must be non-empty string array"));
  }
  if (!Array.isArray(doc.actions) || doc.actions.length === 0) {
    issues.push(issue("/actions", "must be non-empty array"));
  } else {
    doc.actions.forEach((a, i) => {
      if (!isObject(a) || typeof a.name !== "string") {
        issues.push(issue(`/actions/${i}`, "each action must have a name"));
      }
    });
  }
  if (!isObject(doc.state_machine)) {
    issues.push(issue("/state_machine", "required object"));
  } else {
    const sm = doc.state_machine;
    if (!isStringArray(sm.states) || sm.states.length < 2) {
      issues.push(issue("/state_machine/states", "must have at least 2 states"));
    }
    if (typeof sm.initial !== "string" || !sm.initial) {
      issues.push(issue("/state_machine/initial", "required string"));
    } else if (isStringArray(sm.states) && !sm.states.includes(sm.initial)) {
      issues.push(issue("/state_machine/initial", `initial '${sm.initial}' not in states`));
    }
    if (!Array.isArray(sm.transitions) || sm.transitions.length < 1) {
      issues.push(issue("/state_machine/transitions", "must have at least 1 transition"));
    } else {
      sm.transitions.forEach((t, i) => {
        if (!isObject(t)) return issues.push(issue(`/state_machine/transitions/${i}`, "not an object"));
        if (typeof t.from !== "string" || typeof t.to !== "string" || typeof t.on !== "string") {
          issues.push(issue(`/state_machine/transitions/${i}`, "needs from, to, on strings"));
        }
      });
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function validateArchetype(doc: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(doc)) return { ok: false, issues: [issue("/", "not an object")] };
  if (typeof doc.name !== "string") issues.push(issue("/name", "required string"));
  if (!ARCHETYPE_SCALES.has(doc.scale as string)) {
    issues.push(issue("/scale", "must be micro | meso | macro"));
  }
  if (!isStringArray(doc.components) || doc.components.length === 0) {
    issues.push(issue("/components", "must be non-empty string array"));
  }
  if (!isStringArray(doc.behaviors) || doc.behaviors.length === 0) {
    issues.push(issue("/behaviors", "must be non-empty string array"));
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function validateHierarchy(doc: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(doc)) return { ok: false, issues: [issue("/", "not an object")] };
  if (typeof doc.name !== "string") issues.push(issue("/name", "required string"));
  if (typeof doc.root !== "string") issues.push(issue("/root", "required string"));
  if (!Array.isArray(doc.included_components)) {
    issues.push(issue("/included_components", "must be array"));
  }
  if (!Array.isArray(doc.included_behaviors)) {
    issues.push(issue("/included_behaviors", "must be array"));
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/**
 * Cross-document integrity: every behavior's required_components and every
 * archetype's components/behaviors must reference known @id values.
 */
export function validateBundleIntegrity(bundle: {
  components: ComponentDoc[];
  behaviors: BehaviorDoc[];
  archetypes: ArchetypeDoc[];
  hierarchies?: HierarchyDoc[];
}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const componentIds = new Set(bundle.components.map((c) => c["@id"]));
  const behaviorIds = new Set(bundle.behaviors.map((b) => b["@id"]));

  for (const behavior of bundle.behaviors) {
    for (const req of behavior.required_components) {
      if (!componentIds.has(req)) {
        issues.push(issue(`behavior/${behavior.name}/required_components`, `unknown component: ${req}`));
      }
    }
    for (const r of behavior.reads ?? []) {
      if (!componentIds.has(r)) {
        issues.push(issue(`behavior/${behavior.name}/reads`, `unknown component: ${r}`));
      }
    }
    for (const w of behavior.writes ?? []) {
      if (!componentIds.has(w)) {
        issues.push(issue(`behavior/${behavior.name}/writes`, `unknown component: ${w}`));
      }
    }
  }

  for (const archetype of bundle.archetypes) {
    for (const c of archetype.components) {
      if (!componentIds.has(c)) {
        issues.push(issue(`archetype/${archetype.name}/components`, `unknown component: ${c}`));
      }
    }
    for (const b of archetype.behaviors) {
      if (!behaviorIds.has(b)) {
        issues.push(issue(`archetype/${archetype.name}/behaviors`, `unknown behavior: ${b}`));
      }
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

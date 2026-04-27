import type { OntologyRegistry } from "../ontology/registry";
import {
  validateArchetype,
  validateBehavior,
  validateComponent,
} from "../ontology/schema";
import { cosineSimilarity, editDistance } from "./embeddings";
import type { EmbeddingClient } from "./embeddings";
import type { Candidate, Verdict, VerdictZone } from "./types";

export type GateInput = {
  candidate: Candidate;
  registry: OntologyRegistry;
  embedder: EmbeddingClient;
  // Cache of existing concept embeddings keyed by @id.
  existingEmbeddings: Map<string, number[]>;
};

export type GateResult =
  | { ok: true; zone: VerdictZone; nearest?: { id: string; similarity: number } }
  | { ok: false; reason: string; zone: VerdictZone; nearest?: { id: string; similarity: number } };

/** Gate 1: exact or edit-distance match against existing names. */
export function gateStringMatch(input: GateInput): GateResult {
  const name = input.candidate.name;
  const lower = name.toLowerCase();
  const bundle = input.registry.getBundle();
  const allNames = [
    ...bundle.components.map((c) => c.name),
    ...bundle.behaviors.map((b) => b.name),
    ...bundle.archetypes.map((a) => a.name),
  ];
  for (const existing of allNames) {
    if (existing.toLowerCase() === lower) {
      return { ok: false, reason: `name duplicates existing: ${existing}`, zone: "duplicate" };
    }
    if (editDistance(existing.toLowerCase(), lower) <= 2) {
      return {
        ok: false,
        reason: `name too close to existing (edit distance ≤ 2): ${existing}`,
        zone: "duplicate",
      };
    }
  }
  return { ok: true, zone: "novel" };
}

/** Gate 2: embedding similarity against all known concepts. */
export async function gateEmbedding(input: GateInput): Promise<GateResult> {
  const bundle = input.registry.getBundle();
  const text = `${input.candidate.name} ${input.candidate.description}`;
  const vec = await input.embedder.embed(text);

  let maxSim = -1;
  let closestId: string | undefined;
  const all: Array<{ id: string; text: string }> = [
    ...bundle.components.map((c) => ({ id: c["@id"], text: `${c.name} ${c.description}` })),
    ...bundle.behaviors.map((b) => ({ id: b["@id"], text: `${b.name} ${b.description}` })),
  ];

  for (const concept of all) {
    let existing = input.existingEmbeddings.get(concept.id);
    if (!existing) {
      existing = await input.embedder.embed(concept.text);
      input.existingEmbeddings.set(concept.id, existing);
    }
    const sim = cosineSimilarity(vec, existing);
    if (sim > maxSim) {
      maxSim = sim;
      closestId = concept.id;
    }
  }

  if (maxSim === -1) {
    return { ok: true, zone: "novel" };
  }

  if (maxSim >= 0.9) {
    return {
      ok: false,
      reason: `semantic duplicate: cosine ${maxSim.toFixed(3)} vs ${closestId}`,
      zone: "duplicate",
      nearest: closestId ? { id: closestId, similarity: maxSim } : undefined,
    };
  }
  if (maxSim >= 0.8) {
    return {
      ok: true,
      zone: "deliberation",
      nearest: closestId ? { id: closestId, similarity: maxSim } : undefined,
    };
  }
  return {
    ok: true,
    zone: "novel",
    nearest: closestId ? { id: closestId, similarity: maxSim } : undefined,
  };
}

/** Gate 3 (SHACL-lite): JSON-LD shape validation against the ontology schema. */
export function gateShacl(input: GateInput): GateResult {
  const { candidate } = input;
  let result;
  switch (candidate.kind) {
    case "component":
      result = validateComponent(candidate.data);
      break;
    case "behavior":
      result = validateBehavior(candidate.data);
      break;
    case "archetype":
      result = validateArchetype(candidate.data);
      break;
  }
  if (result.ok) return { ok: true, zone: "novel" };
  return {
    ok: false,
    reason: `structural: ${result.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`,
    zone: "novel",
  };
}

/** Gate 4: reference integrity. required_components, archetype refs must resolve. */
export function gateReferences(input: GateInput): GateResult {
  const { candidate, registry } = input;
  const bundle = registry.getBundle();
  const componentIds = new Set(bundle.components.map((c) => c["@id"]));
  const behaviorIds = new Set(bundle.behaviors.map((b) => b["@id"]));

  if (candidate.kind === "behavior") {
    const missing: string[] = [];
    for (const req of candidate.data.required_components) {
      if (!componentIds.has(req)) missing.push(req);
    }
    for (const r of candidate.data.reads ?? []) if (!componentIds.has(r)) missing.push(r);
    for (const w of candidate.data.writes ?? []) if (!componentIds.has(w)) missing.push(w);
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `unresolved components: ${[...new Set(missing)].join(", ")}`,
        zone: "novel",
      };
    }
  }
  if (candidate.kind === "archetype") {
    const missingComponents = candidate.data.components.filter((c) => !componentIds.has(c));
    const missingBehaviors = candidate.data.behaviors.filter((b) => !behaviorIds.has(b));
    const parts: string[] = [];
    if (missingComponents.length > 0) parts.push(`components: ${missingComponents.join(", ")}`);
    if (missingBehaviors.length > 0) parts.push(`behaviors: ${missingBehaviors.join(", ")}`);
    if (parts.length > 0) {
      return { ok: false, reason: `archetype refs unresolved — ${parts.join("; ")}`, zone: "novel" };
    }
  }
  return { ok: true, zone: "novel" };
}

/**
 * Run gates in order. Returns a full Verdict when any gate fails or all pass.
 * The deliberation zone hand-off (embedding 0.80–0.90) is surfaced to the
 * caller via verdict.zone === "deliberation" — the critic agent handles
 * tie-breaks there.
 */
export async function runGates(input: GateInput): Promise<Verdict> {
  const gate1 = gateStringMatch(input);
  if (!gate1.ok) {
    return {
      decision: "reject",
      reason: gate1.reason,
      zone: gate1.zone,
      gateFailures: ["string_match"],
    };
  }

  const gate2 = await gateEmbedding(input);
  if (!gate2.ok) {
    return {
      decision: "reject",
      reason: gate2.reason,
      zone: gate2.zone,
      mergeTargetId: gate2.nearest?.id,
      gateFailures: ["embedding"],
    };
  }
  if (gate2.zone === "deliberation") {
    return {
      decision: "accept", // placeholder; caller may overwrite via critic
      reason: `deliberation zone, nearest ${gate2.nearest?.id}`,
      zone: "deliberation",
      mergeTargetId: gate2.nearest?.id,
      gateFailures: [],
    };
  }

  const gate3 = gateShacl(input);
  if (!gate3.ok) {
    return { decision: "reject", reason: gate3.reason, zone: gate3.zone, gateFailures: ["shacl"] };
  }

  const gate4 = gateReferences(input);
  if (!gate4.ok) {
    return { decision: "reject", reason: gate4.reason, zone: gate4.zone, gateFailures: ["references"] };
  }

  return { decision: "accept", reason: "all gates passed", zone: "novel", gateFailures: [] };
}

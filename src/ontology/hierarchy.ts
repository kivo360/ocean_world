// Hierarchy composition + relevance pruning per docs/07.
//
// Scoring formula:
//   0.30 * usage_frequency    +
//   0.25 * structural_importance +
//   0.25 * root_proximity     +
//   0.20 * information_gain

import type { ArchetypeDoc, BehaviorDoc, ComponentDoc, OntologyBundle } from "./types";

export type ConceptScore = {
  id: string;
  name: string;
  kind: "component" | "behavior";
  score: number;
  signals: {
    usage_frequency: number;
    structural_importance: number;
    root_proximity: number;
    information_gain: number;
  };
};

export type PrunedHierarchy = {
  root: string;
  threshold: number;
  kept: ConceptScore[];
  promoted: ConceptScore[]; // below threshold but kept for dependency integrity
  removed: ConceptScore[];
  integrity: {
    ok: boolean;
    repairs: string[];
  };
};

type Graph = {
  componentsById: Map<string, ComponentDoc>;
  behaviorsById: Map<string, BehaviorDoc>;
  archetypesById: Map<string, ArchetypeDoc>;
  adjacency: Map<string, Set<string>>;
};

function buildGraph(bundle: OntologyBundle): Graph {
  const componentsById = new Map(bundle.components.map((c) => [c["@id"], c]));
  const behaviorsById = new Map(bundle.behaviors.map((b) => [b["@id"], b]));
  const archetypesById = new Map(bundle.archetypes.map((a) => [a["@id"], a]));
  const adjacency = new Map<string, Set<string>>();

  const addEdge = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };

  for (const c of bundle.components) {
    for (const cw of c.composable_with ?? []) addEdge(c["@id"], cw);
  }
  for (const b of bundle.behaviors) {
    for (const rc of b.required_components) addEdge(b["@id"], rc);
    for (const r of b.reads ?? []) addEdge(b["@id"], r);
    for (const w of b.writes ?? []) addEdge(b["@id"], w);
  }
  for (const a of bundle.archetypes) {
    for (const c of a.components) addEdge(a["@id"], c);
    for (const b of a.behaviors) addEdge(a["@id"], b);
  }
  return { componentsById, behaviorsById, archetypesById, adjacency };
}

function usageFrequency(id: string, bundle: OntologyBundle): number {
  if (bundle.archetypes.length === 0) return 0;
  let count = 0;
  for (const a of bundle.archetypes) {
    if (a.components.includes(id) || a.behaviors.includes(id)) count++;
  }
  return count / bundle.archetypes.length;
}

function structuralImportance(id: string, graph: Graph): number {
  const degree = graph.adjacency.get(id)?.size ?? 0;
  // Normalize to [0, 1] against the max degree in the graph.
  let maxDegree = 1;
  for (const set of graph.adjacency.values()) {
    if (set.size > maxDegree) maxDegree = set.size;
  }
  return degree / maxDegree;
}

function rootProximity(id: string, root: string, graph: Graph): number {
  if (id === root) return 1;
  if (!graph.adjacency.has(root)) return 0;
  // BFS from root.
  const visited = new Set<string>([root]);
  const queue: Array<[string, number]> = [[root, 0]];
  while (queue.length > 0) {
    const [node, depth] = queue.shift()!;
    if (node === id) return 1 / (depth + 1);
    for (const neighbor of graph.adjacency.get(node) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push([neighbor, depth + 1]);
    }
  }
  return 0; // disconnected
}

function informationGain(id: string, bundle: OntologyBundle): number {
  // Simple heuristic: fraction of archetypes where this appears *independently*
  // of another archetype with the same-kind concept. Returns entropy-like in [0, 1].
  let count = 0;
  for (const a of bundle.archetypes) {
    if (a.components.includes(id) || a.behaviors.includes(id)) count++;
  }
  if (count === 0 || bundle.archetypes.length === 0) return 0;
  const p = count / bundle.archetypes.length;
  // Binary entropy, rescaled to [0, 1].
  if (p === 0 || p === 1) return 0;
  const h = -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
  return h;
}

export function scoreConcept(
  id: string,
  kind: "component" | "behavior",
  root: string,
  bundle: OntologyBundle,
  graph: Graph,
  name: string,
): ConceptScore {
  const signals = {
    usage_frequency: usageFrequency(id, bundle),
    structural_importance: structuralImportance(id, graph),
    root_proximity: rootProximity(id, root, graph),
    information_gain: informationGain(id, bundle),
  };
  const score =
    0.3 * signals.usage_frequency +
    0.25 * signals.structural_importance +
    0.25 * signals.root_proximity +
    0.2 * signals.information_gain;
  return { id, name, kind, score, signals };
}

function dependencyCheck(
  candidate: ConceptScore,
  kept: ConceptScore[],
  bundle: OntologyBundle,
): { safe: boolean; reason?: string } {
  if (candidate.kind === "component") {
    const keptBehaviors = kept.filter((k) => k.kind === "behavior");
    for (const b of bundle.behaviors) {
      if (!keptBehaviors.some((k) => k.id === b["@id"])) continue;
      if (b.required_components.includes(candidate.id)) {
        return { safe: false, reason: `${b.name} requires ${candidate.name}` };
      }
    }
  }
  if (candidate.kind === "behavior") {
    const keptComponents = kept.filter((k) => k.kind === "component");
    const behaviorDoc = bundle.behaviors.find((b) => b["@id"] === candidate.id);
    if (!behaviorDoc) return { safe: true };
    for (const kc of keptComponents) {
      const writersOfKc = bundle.behaviors.filter((b) => (b.writes ?? []).includes(kc.id));
      if (writersOfKc.length === 1 && writersOfKc[0]!["@id"] === candidate.id) {
        return { safe: false, reason: `only writer to ${kc.name}` };
      }
    }
  }
  return { safe: true };
}

export function prune(
  bundle: OntologyBundle,
  root: string,
  threshold = 0.35,
): PrunedHierarchy {
  const graph = buildGraph(bundle);

  const allScores: ConceptScore[] = [
    ...bundle.components.map((c) => scoreConcept(c["@id"], "component", root, bundle, graph, c.name)),
    ...bundle.behaviors.map((b) => scoreConcept(b["@id"], "behavior", root, bundle, graph, b.name)),
  ];

  // Phase 2: threshold partition.
  const aboveThreshold = allScores.filter((s) => s.score >= threshold);
  const candidates = allScores.filter((s) => s.score < threshold);

  // Phase 3: dependency protection.
  const promoted: ConceptScore[] = [];
  const removed: ConceptScore[] = [];
  for (const candidate of candidates) {
    const check = dependencyCheck(candidate, aboveThreshold, bundle);
    if (!check.safe) {
      promoted.push(candidate);
    } else {
      removed.push(candidate);
    }
  }

  const kept = [...aboveThreshold, ...promoted].sort((a, b) => b.score - a.score);

  // Phase 5: integrity verification + auto-repair.
  const repairs: string[] = [];
  const keptIds = new Set(kept.map((k) => k.id));
  let integrityOk = true;

  // Every kept behavior's required components must be kept.
  for (const k of kept.filter((k) => k.kind === "behavior")) {
    const behavior = bundle.behaviors.find((b) => b["@id"] === k.id);
    if (!behavior) continue;
    for (const req of behavior.required_components) {
      if (!keptIds.has(req)) {
        const missing = allScores.find((s) => s.id === req);
        if (missing) {
          kept.push(missing);
          keptIds.add(req);
          repairs.push(`auto-repair: added ${req} (required by ${behavior.name})`);
        } else {
          integrityOk = false;
          repairs.push(`unrepaired: ${behavior.name} requires unknown ${req}`);
        }
      }
    }
  }

  // No orphan components (every kept component read/written by some kept behavior).
  const keptBehaviors = bundle.behaviors.filter((b) => keptIds.has(b["@id"]));
  for (const c of kept.filter((k) => k.kind === "component")) {
    const touched = keptBehaviors.some(
      (b) =>
        (b.required_components ?? []).includes(c.id) ||
        (b.reads ?? []).includes(c.id) ||
        (b.writes ?? []).includes(c.id),
    );
    if (!touched) {
      // Demote orphans: move from kept to removed.
      const idx = kept.findIndex((k) => k.id === c.id);
      if (idx >= 0) {
        const [orphan] = kept.splice(idx, 1);
        keptIds.delete(c.id);
        removed.push(orphan!);
        repairs.push(`demoted orphan component: ${c.name}`);
      }
    }
  }

  return {
    root,
    threshold,
    kept,
    promoted,
    removed,
    integrity: { ok: integrityOk, repairs },
  };
}

/**
 * Entropy consolidation: merge siblings that co-occur > 0.85 and carry
 * redundant information (conditional entropy H(B|A) < 0.1). Returns a list of
 * suggested merges — callers decide whether to apply them to the live bundle.
 */
export function suggestMerges(
  bundle: OntologyBundle,
): Array<{ keep: string; merge: string; cooccurrence: number; conditional_entropy: number }> {
  const archetypes = bundle.archetypes;
  const suggestions: Array<{
    keep: string;
    merge: string;
    cooccurrence: number;
    conditional_entropy: number;
  }> = [];
  if (archetypes.length === 0) return suggestions;

  const concepts = [
    ...bundle.components.map((c) => c["@id"]),
    ...bundle.behaviors.map((b) => b["@id"]),
  ];

  const presence = new Map<string, Set<string>>();
  for (const id of concepts) presence.set(id, new Set());
  for (const a of archetypes) {
    for (const c of a.components) presence.get(c)?.add(a["@id"]);
    for (const b of a.behaviors) presence.get(b)?.add(a["@id"]);
  }

  const total = archetypes.length;
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const a = concepts[i]!;
      const b = concepts[j]!;
      const sa = presence.get(a)!;
      const sb = presence.get(b)!;
      if (sa.size === 0 || sb.size === 0) continue;
      const intersection = [...sa].filter((x) => sb.has(x)).length;
      const union = new Set([...sa, ...sb]).size;
      const cooccurrence = intersection / union;
      if (cooccurrence <= 0.85) continue;
      const pB = sb.size / total;
      const pBgivenA = intersection / sa.size;
      const conditional_entropy =
        pBgivenA === 0 || pBgivenA === 1
          ? 0
          : -(pBgivenA * Math.log2(pBgivenA) + (1 - pBgivenA) * Math.log2(1 - pBgivenA));
      if (conditional_entropy < 0.1 && pB > 0) {
        suggestions.push({ keep: a, merge: b, cooccurrence, conditional_entropy });
      }
    }
  }
  return suggestions;
}

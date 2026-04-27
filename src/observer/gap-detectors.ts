import type { OntologyRegistry } from "../ontology/registry";
import type { Repository } from "../storage/repository";
import type { BehaviorName } from "../simulation/entity";
import type { GapSignal } from "./types";
import type { Domain } from "../ontology/types";

export type DetectorContext = {
  repo: Repository;
  registry: OntologyRegistry;
  sinceTick: number;
  endTick: number;
};

/** Stuck entities: same (x, y) across a long window. */
export async function detectStuckEntities(ctx: DetectorContext): Promise<GapSignal[]> {
  const entities = await ctx.repo.listEntities();
  const signals: GapSignal[] = [];
  const events = await ctx.repo.listEvents({ sinceTick: ctx.sinceTick });

  // Count movement events per entity in the window.
  const movedSet = new Set<string>();
  for (const e of events) {
    if (e.kind === "speech" || e.kind === "trade") {
      movedSet.add(e.source);
      if (e.target) movedSet.add(e.target);
    }
  }
  const stuck: string[] = [];
  for (const ent of entities) {
    if (!movedSet.has(ent.id)) stuck.push(ent.id);
  }

  if (stuck.length > Math.max(3, entities.length * 0.2)) {
    signals.push({
      kind: "stuck_entity",
      severity: stuck.length > entities.length * 0.5 ? "high" : "medium",
      domain: "social",
      evidence: `${stuck.length}/${entities.length} entities had no speech/trade events in ticks ${ctx.sinceTick}–${ctx.endTick}`,
      entities: stuck.slice(0, 10),
      suggestion: "Add a social behavior that activates when entities are isolated",
    });
  }
  return signals;
}

/** Repeated failed actions: same entity, same noop reason, 3+ times. */
export async function detectRepeatedFailures(ctx: DetectorContext): Promise<GapSignal[]> {
  const events = await ctx.repo.listEvents({
    sinceTick: ctx.sinceTick,
    kind: "needs_deliberation",
  });
  const perEntity = new Map<string, number>();
  for (const e of events) {
    perEntity.set(e.source, (perEntity.get(e.source) ?? 0) + 1);
  }
  const signals: GapSignal[] = [];
  for (const [id, count] of perEntity) {
    if (count >= 3) {
      signals.push({
        kind: "repeated_failed_action",
        severity: count > 10 ? "high" : "medium",
        domain: "cognitive",
        evidence: `entity ${id} entered needs_deliberation ${count} times`,
        entities: [id],
        suggestion: "Add a behavior that scores above threshold in this entity's context",
      });
    }
  }
  return signals;
}

/** Orphan components: in the runtime but no behavior reads/writes them. */
export async function detectOrphanComponents(ctx: DetectorContext): Promise<GapSignal[]> {
  const bundle = ctx.registry.getBundle();
  const used = new Set<string>();
  for (const b of bundle.behaviors) {
    for (const rc of b.required_components) used.add(rc);
    for (const r of b.reads ?? []) used.add(r);
    for (const w of b.writes ?? []) used.add(w);
  }
  const signals: GapSignal[] = [];
  for (const c of bundle.components) {
    if (!used.has(c["@id"])) {
      signals.push({
        kind: "orphan_component",
        severity: "low",
        domain: c.domain,
        evidence: `${c.name} (${c["@id"]}) has no reading or writing behavior`,
        suggestion: `Add a behavior in ${c.domain} that reads or writes ${c.name}`,
      });
    }
  }
  return signals;
}

/** Inactive behaviors: declared on archetypes but never fire in the window. */
export async function detectInactiveBehaviors(ctx: DetectorContext): Promise<GapSignal[]> {
  const events = await ctx.repo.listEvents({ sinceTick: ctx.sinceTick });
  const eventKinds = new Set(events.map((e) => e.kind));
  const bundle = ctx.registry.getBundle();
  const signals: GapSignal[] = [];
  // Heuristic map behavior -> event kinds it produces. Static mapping for the
  // initial set we ship; richer mappings can come from the behavior metadata.
  const behaviorToEventKinds: Partial<Record<BehaviorName, string[]>> = {
    Trade: ["trade"],
    Converse: ["speech"],
  };
  for (const b of bundle.behaviors) {
    const expected = behaviorToEventKinds[b.name as BehaviorName];
    if (!expected) continue;
    const anyFired = expected.some((k) => eventKinds.has(k));
    if (!anyFired) {
      signals.push({
        kind: "inactive_behavior",
        severity: "low",
        domain: b.domain,
        evidence: `behavior ${b.name} produced no events of kinds ${expected.join(", ")} in ticks ${ctx.sinceTick}–${ctx.endTick}`,
        suggestion: `Adjust scoring or preconditions of ${b.name} so it fires in the current scenario`,
      });
    }
  }
  return signals;
}

/** Interaction diversity: if > 95% of events are one kind, flag it. */
export async function detectLowInteractionDiversity(ctx: DetectorContext): Promise<GapSignal[]> {
  const events = await ctx.repo.listEvents({ sinceTick: ctx.sinceTick });
  if (events.length < 20) return [];
  const byKind: Record<string, number> = {};
  for (const e of events) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  const kinds = Object.entries(byKind).sort((a, b) => b[1] - a[1]);
  const dominant = kinds[0]!;
  const ratio = dominant[1] / events.length;
  if (ratio > 0.95) {
    return [
      {
        kind: "low_interaction_diversity",
        severity: "medium",
        domain: "social",
        evidence: `${(ratio * 100).toFixed(0)}% of events are '${dominant[0]}' (${dominant[1]}/${events.length})`,
        suggestion: "Introduce new behavior types to broaden the event mix",
      },
    ];
  }
  return [];
}

export async function collectAllSignals(ctx: DetectorContext): Promise<GapSignal[]> {
  const all = await Promise.all([
    detectStuckEntities(ctx),
    detectRepeatedFailures(ctx),
    detectOrphanComponents(ctx),
    detectInactiveBehaviors(ctx),
    detectLowInteractionDiversity(ctx),
  ]);
  return all.flat();
}

export function computeDomainPressure(signals: GapSignal[]): Partial<Record<Domain, number>> {
  const weightBy: Record<GapSignal["severity"], number> = { low: 1, medium: 2, high: 3 };
  const out: Partial<Record<Domain, number>> = {};
  for (const s of signals) {
    out[s.domain] = (out[s.domain] ?? 0) + weightBy[s.severity];
  }
  return out;
}

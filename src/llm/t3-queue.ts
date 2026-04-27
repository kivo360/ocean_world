import type { Action } from "../simulation/actions";
import type { Entity } from "../simulation/entity";
import type { World } from "../simulation/world";
import { emit, recordDeliberation } from "../simulation/world";
import { buildT3Context } from "./types";
import type { T3Client, T3SelectedAction } from "./types";

/**
 * Async T3 queue per docs/03.
 *
 * Deterministic T1/T2 entities resolve on the current tick. T3 entities are
 * queued; the LLM call runs asynchronously; their actions land on a
 * `resolvedActions` map that the tick loop consumes one tick later. Entities
 * without a resolved action fall back to a safe default (noop or rest).
 */
export class T3Queue {
  private readonly client: T3Client;
  private pendingIds = new Set<string>();
  private resolvedActions = new Map<string, T3SelectedAction>();
  private inFlight: Promise<void> | null = null;
  private readonly maxBatchSize: number;
  private readonly log: (msg: string) => void;

  constructor(client: T3Client, maxBatchSize = 12, logger?: (msg: string) => void) {
    this.client = client;
    this.maxBatchSize = maxBatchSize;
    this.log = logger ?? (() => undefined);
  }

  /** Mark an entity as needing deliberation on next tick. */
  queue(entityId: string): void {
    this.pendingIds.add(entityId);
  }

  /** Drain a pending action resolved by an earlier batch. */
  take(entityId: string): T3SelectedAction | undefined {
    const action = this.resolvedActions.get(entityId);
    if (action) this.resolvedActions.delete(entityId);
    return action;
  }

  hasResolved(entityId: string): boolean {
    return this.resolvedActions.has(entityId);
  }

  size(): { pending: number; resolved: number; inFlight: boolean } {
    return {
      pending: this.pendingIds.size,
      resolved: this.resolvedActions.size,
      inFlight: this.inFlight !== null,
    };
  }

  /** Snapshot of currently pending or in-flight entity IDs (for UI overlays). */
  pendingEntityIds(): string[] {
    return Array.from(this.pendingIds);
  }

  /** Snapshot of resolved IDs awaiting consumption. */
  resolvedEntityIds(): string[] {
    return Array.from(this.resolvedActions.keys());
  }

  /** True when this client makes real network calls. */
  get live(): boolean {
    return this.client.live;
  }

  /**
   * Called once per tick by the tick loop. If a prior call resolved, its
   * actions are already in resolvedActions. If there's no in-flight batch and
   * pending entities exist, kick off a new batch.
   */
  beginBatch(world: World): void {
    if (this.inFlight) return;
    if (this.pendingIds.size === 0) return;

    const ids = Array.from(this.pendingIds).slice(0, this.maxBatchSize);
    for (const id of ids) this.pendingIds.delete(id);

    const entities = ids
      .map((id) => world.entities.get(id))
      .filter((e): e is Entity => !!e);

    if (entities.length === 0) return;

    const contexts = entities.map((e) =>
      buildT3Context(e, inferSituation(e), world),
    );

    const startTick = world.tick;
    const startedAtMs = (typeof performance !== "undefined" ? performance : Date).now();
    this.log(`T3 batch started at tick ${startTick} for ${entities.length} entities`);

    const sourceLabel: "stub" | "live" = this.client.live ? "live" : "stub";
    const contextById = new Map(contexts.map((c) => [c.id, c] as const));
    const entityById = new Map(entities.map((e) => [e.id, e] as const));

    this.inFlight = (async () => {
      try {
        const responses = await this.client.selectActions(contexts);
        const latencyMs = (typeof performance !== "undefined" ? performance : Date).now() - startedAtMs;
        for (const r of responses) {
          this.resolvedActions.set(r.entityId, r.action);
          const ctx = contextById.get(r.entityId);
          const entity = entityById.get(r.entityId);
          if (!ctx || !entity) continue;
          recordDeliberation(world, {
            tick: startTick,
            entityId: r.entityId,
            entityName: entity.name,
            archetype: entity.archetype,
            situation: ctx.situation,
            retrievedMemories: ctx.relevantMemories.slice(0, 3).map((m) => ({
              tick: m.tick,
              kind: m.kind,
              summary: m.summary,
            })),
            actionKind: r.action.kind,
            actionTarget: actionTarget(r.action),
            actionDetail: actionDetail(r.action),
            rationale: r.action.rationale,
            latencyMs,
            source: sourceLabel,
          });
        }
        emit(world, {
          kind: "t3_batch_resolved",
          source: "t3-queue",
          summary: `${responses.length}/${entities.length} actions (started tick ${startTick}, ${latencyMs.toFixed(0)}ms)`,
        });
      } catch (err) {
        emit(world, {
          kind: "t3_batch_failed",
          source: "t3-queue",
          summary: (err as Error).message,
        });
      } finally {
        this.inFlight = null;
      }
    })();
  }
}

/** Convert the T3 structured action into the tick loop's typed Action. */
export function t3ActionToTickAction(entityId: string, action: T3SelectedAction): Action {
  switch (action.kind) {
    case "move_to":
      return { kind: "move_to", entityId, x: action.x, y: action.y };
    case "speak":
      return { kind: "speak", entityId, target: action.target, msg: action.msg };
    case "trade":
      return {
        kind: "trade",
        entityId,
        target: action.target,
        goods: action.goods,
        price: action.price,
      };
    case "rest":
      return { kind: "rest", entityId };
    case "noop":
      return { kind: "noop", entityId, reason: action.rationale ?? "t3 noop" };
  }
}

function inferSituation(entity: Entity): string {
  const perceived = entity.components.perceived;
  const pending = perceived?.tradeOffers[0];
  const speech = perceived?.incomingSpeech[0];
  if (pending) return `trade offer from ${pending.from}: ${pending.goods} goods for ${pending.price}`;
  if (speech) return `just heard from ${speech.from}: "${speech.msg}"`;
  if ((perceived?.nearbyIds.length ?? 0) > 3) return "crowded area";
  return "ambient decision — no clear T2 winner";
}

function actionTarget(action: T3SelectedAction): string | undefined {
  if (action.kind === "speak" || action.kind === "trade") return action.target;
  return undefined;
}

function actionDetail(action: T3SelectedAction): string | undefined {
  switch (action.kind) {
    case "speak":
      return action.msg;
    case "trade":
      return `${action.goods}g @ ${action.price}`;
    case "move_to":
      return `(${Math.round(action.x)}, ${Math.round(action.y)})`;
    default:
      return undefined;
  }
}

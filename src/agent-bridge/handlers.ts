import type { Entity } from "../simulation/entity";
import type { Repository } from "../storage/repository";
import type {
  InspectEntityInput,
  ListEntitiesInput,
  RunTicksInput,
  SpawnEntityInput,
  SummarizeEventsInput,
  ToolCall,
  ToolResult,
  WireRelationInput,
} from "./types";

export type ToolHandlers = {
  [K in ToolCall["tool"]]: (
    input: Extract<ToolCall, { tool: K }>["input"],
  ) => Promise<unknown>;
};

function entityPublicView(e: Entity): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    archetype: e.archetype,
    activeBehavior: e.activeBehavior,
    phase: e.state[e.activeBehavior]?.phase ?? "Idle",
    behaviors: e.behaviors,
    components: {
      physical: e.components.physical
        ? {
            x: Math.round(e.components.physical.x),
            y: Math.round(e.components.physical.y),
            energy: Number(e.components.physical.energy.toFixed(3)),
          }
        : null,
      cognitive: e.components.cognitive
        ? {
            values: e.components.cognitive.values,
          }
        : null,
      financial: e.components.financial ?? null,
      inventory: e.components.inventory ?? null,
      memory: e.components.memory
        ? { recent: e.components.memory.recent.slice(-8) }
        : null,
    },
  };
}

export function createHandlers(repo: Repository): ToolHandlers {
  return {
    spawn_entity: async (input: SpawnEntityInput) => {
      const count = input.count ?? 1;
      const spawned: string[] = [];
      for (let i = 0; i < count; i++) {
        const entity = await repo.spawn({
          archetype: input.archetype,
          x: input.x,
          y: input.y,
          values: input.values as never,
        });
        spawned.push(entity.id);
      }
      return { spawned, count: spawned.length };
    },

    run_ticks: async (input: RunTicksInput) => {
      const tick = await repo.advanceTick(input.ticks);
      return { tick, advanced: input.ticks };
    },

    inspect_entity: async (input: InspectEntityInput) => {
      const entity = await repo.getEntity(input.entityId);
      if (!entity) throw new Error(`entity ${input.entityId} not found`);
      return entityPublicView(entity);
    },

    list_entities: async (input: ListEntitiesInput) => {
      const entities = await repo.listEntities({
        archetype: input.archetype,
        limit: input.limit ?? 50,
      });
      return {
        count: entities.length,
        entities: entities.map((e) => ({
          id: e.id,
          name: e.name,
          archetype: e.archetype,
          activeBehavior: e.activeBehavior,
        })),
      };
    },

    summarize_events: async (input: SummarizeEventsInput) => {
      const events = await repo.listEvents({
        sinceTick: input.sinceTick,
        kind: input.kind,
        limit: input.limit ?? 50,
      });
      const byKind: Record<string, number> = {};
      for (const e of events) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
      return {
        total: events.length,
        byKind,
        recent: events.slice(-20).map((e) => ({
          tick: e.tick,
          kind: e.kind,
          source: e.source,
          target: e.target ?? null,
          summary: e.summary,
        })),
      };
    },

    wire_relation: async (input: WireRelationInput) => {
      await repo.relate({
        kind: input.kind,
        from: input.from,
        to: input.to,
        data: input.data ?? {},
      });
      return { ok: true };
    },

    world_stats: async () => {
      return repo.stats();
    },
  };
}

export async function executeToolCall(
  repo: Repository,
  call: ToolCall,
): Promise<ToolResult> {
  const handlers = createHandlers(repo);
  try {
    const handler = handlers[call.tool] as (input: unknown) => Promise<unknown>;
    if (!handler) return { ok: false, error: `unknown tool: ${(call as { tool: string }).tool}` };
    const data = await handler(call.input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

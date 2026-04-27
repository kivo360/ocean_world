import type { Archetype } from "../simulation/entity";
import type { RelationKind } from "../storage/repository";

export type SpawnEntityInput = {
  archetype: Archetype;
  count?: number;
  x?: number;
  y?: number;
  values?: Record<string, number>;
};

export type RunTicksInput = {
  ticks: number;
};

export type InspectEntityInput = {
  entityId: string;
};

export type ListEntitiesInput = {
  archetype?: Archetype;
  limit?: number;
};

export type SummarizeEventsInput = {
  sinceTick?: number;
  kind?: string;
  limit?: number;
};

export type WireRelationInput = {
  kind: RelationKind;
  from: string;
  to: string;
  data?: Record<string, string | number>;
};

export type ToolName =
  | "spawn_entity"
  | "run_ticks"
  | "inspect_entity"
  | "list_entities"
  | "summarize_events"
  | "wire_relation"
  | "world_stats";

export type ToolCall =
  | { tool: "spawn_entity"; input: SpawnEntityInput }
  | { tool: "run_ticks"; input: RunTicksInput }
  | { tool: "inspect_entity"; input: InspectEntityInput }
  | { tool: "list_entities"; input: ListEntitiesInput }
  | { tool: "summarize_events"; input: SummarizeEventsInput }
  | { tool: "wire_relation"; input: WireRelationInput }
  | { tool: "world_stats"; input: Record<string, never> };

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

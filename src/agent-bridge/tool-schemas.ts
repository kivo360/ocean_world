// MCP-compatible tool schemas. These describe each tool to an LLM / agent.
// The same shapes work for Claude's SDK agent definitions and for any MCP
// server that advertises its tools.

export type JsonSchema = {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
};

export type ToolSchema = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

export const TOOL_SCHEMAS: readonly ToolSchema[] = [
  {
    name: "spawn_entity",
    description:
      "Spawn one or more entities of a given archetype in the ocean-world simulation. Returns the spawned entity ids.",
    inputSchema: {
      type: "object",
      properties: {
        archetype: {
          type: "string",
          enum: ["Person", "Merchant", "Wanderer"],
          description: "Archetype to spawn.",
        },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "How many to spawn (default 1).",
        },
        x: { type: "number", description: "Optional start x coord." },
        y: { type: "number", description: "Optional start y coord." },
        values: {
          type: "object",
          description: "Optional override of cognitive values (profit, community, etc.).",
        },
      },
      required: ["archetype"],
    },
  },
  {
    name: "run_ticks",
    description: "Advance the simulation by N ticks. Returns the new tick count.",
    inputSchema: {
      type: "object",
      properties: {
        ticks: { type: "integer", minimum: 1, maximum: 5000 },
      },
      required: ["ticks"],
    },
  },
  {
    name: "inspect_entity",
    description: "Read the full entity record (components, values, memory).",
    inputSchema: {
      type: "object",
      properties: { entityId: { type: "string" } },
      required: ["entityId"],
    },
  },
  {
    name: "list_entities",
    description: "List entities. Optionally filter by archetype.",
    inputSchema: {
      type: "object",
      properties: {
        archetype: { type: "string", enum: ["Person", "Merchant", "Wanderer"] },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
    },
  },
  {
    name: "summarize_events",
    description: "Return recent world events, optionally filtered by kind or since tick.",
    inputSchema: {
      type: "object",
      properties: {
        sinceTick: { type: "integer", minimum: 0 },
        kind: { type: "string", description: "e.g. 'trade', 'speech', 'needs_deliberation'" },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
    },
  },
  {
    name: "wire_relation",
    description: "Create a typed relation edge between two entities.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["employs", "trusts", "member_of"] },
        from: { type: "string" },
        to: { type: "string" },
        data: { type: "object", description: "Optional data payload for the edge." },
      },
      required: ["kind", "from", "to"],
    },
  },
  {
    name: "world_stats",
    description: "Return world stats: tick, entity count, events count, archetype breakdown.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

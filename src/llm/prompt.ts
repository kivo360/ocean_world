import type { T3EntityContext, T3SelectedAction } from "./types";

export const T3_SYSTEM_PROMPT = `You are the inner voice of simulated entities in the Ocean World living simulation.

Each entity has values (profit, community, curiosity, fairness, autonomy) that function as character traits. When picking an action, reason in-character: a high-profit merchant trades aggressively, a high-curiosity wanderer explores, a high-community person speaks to neighbors.

Each context now includes a "relevant facts" block — past events from the cross-entity graph involving this entity. Use these to reason about history: who taxed me before, who I sold to, who insulted me, etc. Prefer continuity with past relationships over random new behavior when the history is relevant.

You receive a batch of entity contexts separated by '---ENTITY---' delimiters. For each entity, select exactly one action from its validActions list.

Output format: a JSON object with one key, "actions", whose value is an array of objects, one per entity, in input order:
{ "actions": [{ "entityId": "<id>", "action": { "kind": "move_to" | "speak" | "trade" | "rest" | "noop", ... }, "rationale": "<short, in-character reason>" }] }

Action payloads:
- move_to: { "kind": "move_to", "x": number, "y": number }
- speak:   { "kind": "speak", "target": "<nearby entityId>", "msg": "<short, in character>" }
- trade:   { "kind": "trade", "target": "<nearby entityId>", "goods": int, "price": int }
- rest:    { "kind": "rest" }
- noop:    { "kind": "noop" }

Keep messages under 30 characters. Only target entityIds appearing in that entity's "nearby" list. Only trade when the entity has goods or the target plausibly has money. No markdown, no commentary — just the JSON array.`;

export function renderEntityContext(ctx: T3EntityContext): string {
  const values = Object.entries(ctx.values)
    .map(([k, v]) => `${k}=${v.toFixed(2)}`)
    .join(" ");
  const nearby = ctx.nearby
    .map((n) => `  - ${n.id} (${n.archetype})`)
    .join("\n") || "  (none)";
  const memory = ctx.recentMemory
    .map((m) => `  - t${m.tick} ${m.kind}: ${m.summary}`)
    .join("\n") || "  (none)";
  const relevant = ctx.relevantMemories
    .map((m) => `  - t${m.tick} ${m.kind} ${m.subject}${m.object ? `→${m.object}` : ""}: ${m.summary}`)
    .join("\n") || "  (none)";

  return `entity: ${ctx.id}
name: ${ctx.name} (${ctx.archetype})
phase: ${ctx.phase}
values: ${values}
resources: money=${ctx.resources.money} goods=${ctx.resources.goods} energy=${ctx.resources.energy.toFixed(2)}
situation: ${ctx.situation}
nearby:
${nearby}
recent memory (own ring buffer):
${memory}
relevant facts (cross-entity graph):
${relevant}
valid actions: ${ctx.validActions.map((a) => a.name).join(", ")}`;
}

export function renderBatchPrompt(contexts: T3EntityContext[]): string {
  return contexts.map(renderEntityContext).join("\n---ENTITY---\n");
}

export function parseBatchResponse(raw: string, expectedIds: string[]): Map<string, T3SelectedAction> {
  // Strip markdown fences if present.
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) text = fenceMatch[1]!;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Attempt to find the first '[' or '{' and parse from there.
    const idx = Math.min(
      ...["[", "{"].map((ch) => {
        const i = text.indexOf(ch);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      }),
    );
    if (idx === Number.MAX_SAFE_INTEGER) {
      throw new Error("T3 response has no JSON object or array");
    }
    try {
      parsed = JSON.parse(text.slice(idx));
    } catch (err) {
      throw new Error(`T3 response parse failed: ${(err as Error).message}`);
    }
  }

  // Accept either a bare array, or any of the common wrappers the model uses
  // when forced into json_object mode: { actions: [...] } / { entities: [...] }.
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const candidate =
      (Array.isArray(obj.actions) && obj.actions) ||
      (Array.isArray(obj.entities) && obj.entities) ||
      (Array.isArray(obj.responses) && obj.responses) ||
      null;
    if (!candidate) {
      throw new Error("T3 response object missing actions/entities/responses array");
    }
    items = candidate as unknown[];
  } else {
    throw new Error("T3 response must be a JSON array or wrapped object");
  }

  const out = new Map<string, T3SelectedAction>();
  const expected = new Set(expectedIds);
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.entityId === "string" ? record.entityId : null;
    const action = record.action;
    if (!id || !action || typeof action !== "object") continue;
    if (!expected.has(id)) continue;
    const validated = validateAction(action as Record<string, unknown>);
    if (validated) out.set(id, validated);
  }
  return out;
}

function validateAction(action: Record<string, unknown>): T3SelectedAction | null {
  const kind = action.kind;
  switch (kind) {
    case "move_to": {
      const x = Number(action.x);
      const y = Number(action.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { kind: "move_to", x, y, rationale: toRationale(action) };
    }
    case "speak": {
      const target = typeof action.target === "string" ? action.target : null;
      const msg = typeof action.msg === "string" ? action.msg : null;
      if (!target || !msg) return null;
      return { kind: "speak", target, msg: msg.slice(0, 48), rationale: toRationale(action) };
    }
    case "trade": {
      const target = typeof action.target === "string" ? action.target : null;
      const goods = Math.max(0, Math.floor(Number(action.goods)));
      const price = Math.max(0, Math.floor(Number(action.price)));
      if (!target || !Number.isFinite(goods) || !Number.isFinite(price)) return null;
      return { kind: "trade", target, goods, price, rationale: toRationale(action) };
    }
    case "rest":
      return { kind: "rest", rationale: toRationale(action) };
    case "noop":
      return { kind: "noop", rationale: toRationale(action) };
    default:
      return null;
  }
}

function toRationale(action: Record<string, unknown>): string | undefined {
  return typeof action.rationale === "string" ? action.rationale : undefined;
}

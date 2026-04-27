import type { T3Client, T3EntityContext, T3Response, T3SelectedAction } from "./types";

/**
 * Deterministic stand-in for when no ANTHROPIC_API_KEY is available. It returns
 * plausible in-character actions based on values, situation, and the new
 * cross-entity graph retrievals. Good enough to exercise the T3 plumbing,
 * async queue, and tests without paying per token.
 */
export class StubT3Client implements T3Client {
  readonly live = false;

  async selectActions(contexts: T3EntityContext[]): Promise<T3Response[]> {
    return contexts.map((ctx) => ({ entityId: ctx.id, action: pickAction(ctx) }));
  }
}

function pickAction(ctx: T3EntityContext): T3SelectedAction {
  const { values, resources, nearby, situation, relevantMemories } = ctx;
  const needsRest = resources.energy < 0.25;
  if (needsRest) return { kind: "rest", rationale: "energy low" };

  const profit = values.profit ?? 0.5;
  const community = values.community ?? 0.5;
  const curiosity = values.curiosity ?? 0.5;
  const fairness = values.fairness ?? 0.5;

  // History-aware: if I was recently taxed, prefer to move away.
  const taxedBy = relevantMemories.find((m) => m.kind === "tax" && m.object === ctx.id);
  if (taxedBy && fairness < 0.5) {
    return {
      kind: "move_to",
      x: Math.round(200 + Math.sin(ctx.id.length * 7) * 350),
      y: Math.round(200 + Math.cos(ctx.id.length * 7) * 200),
      rationale: `stub: avoiding ${taxedBy.subject} after tax at t${taxedBy.tick}`,
    };
  }

  // History-aware: if I traded with someone recently, talk to them again
  // (continuity over randomness, matches the system-prompt guidance).
  const pastTrade = relevantMemories.find((m) => m.kind === "trade");
  if (pastTrade && community > 0.4 && nearby.length > 0) {
    const partnerId = pastTrade.subject === ctx.id ? pastTrade.object : pastTrade.subject;
    const stillNearby = partnerId && nearby.find((n) => n.id === partnerId);
    if (stillNearby) {
      return {
        kind: "speak",
        target: stillNearby.id,
        msg: "good to see you again",
        rationale: `stub: continuity with prior trade partner ${partnerId}`,
      };
    }
  }

  // If we're about to trade (situation mentions "offer" / "trade") and we have a target.
  if (/offer|trade/i.test(situation) && nearby.length > 0 && resources.goods > 0) {
    const price = Math.max(2, Math.round(6 + (1 - fairness) * 8));
    return {
      kind: "trade",
      target: nearby[0]!.id,
      goods: 1,
      price,
      rationale: `stub: profit=${profit.toFixed(2)}`,
    };
  }

  // Social fallback: speak to nearby if community is dominant.
  if (community > profit && community > curiosity && nearby.length > 0) {
    return {
      kind: "speak",
      target: nearby[0]!.id,
      msg: "hello there",
      rationale: `stub: community=${community.toFixed(2)}`,
    };
  }

  // Explore otherwise.
  return {
    kind: "move_to",
    x: Math.round(500 + Math.sin(ctx.id.length) * 300),
    y: Math.round(350 + Math.cos(ctx.id.length) * 200),
    rationale: "stub: wander",
  };
}

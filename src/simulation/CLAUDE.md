# Simulation internals

## T1 / T2 / T3 tick split
- **T1** (lock check): if the entity's active behavior is in a locked phase (e.g. `Converse/Listening`, `Trade/Settling`, `Rest/Resting`), it wins unconditionally — no scoring.
- **T2** (scoring): each behavior's `score(entity, world)` × `valueWeight(values, name)`. Best wins. Threshold `0.25` — below it, T3 is requested.
- **T3** (LLM): queued via `T3Queue.queue(entity.id)`. While waiting, T2 action still executes so ticks stay alive. Only active-region NPCs can reach T3.
- Forced T3 cadence: every 80 ticks per entity regardless of score, spread by `entityIdHash(id) % 80` to avoid LLM dogpile.

## Ambient vs active vs frozen
- `entityActivity()` returns `"active"` (full T1+T2+T3), `"ambient"` (T2-only, every 10th tick), or `"frozen"` (skip).
- Active region = region containing the Player. Sticky: if player walks off all regions, last region stays active.
- No regions defined → all entities are `"active"` (legacy/test mode).

## Behavior dispatch flow
`runTick` → `perceive` → `decide` → `resolve` → `applyPerceivedInputs` → `passiveDecay` → `t3Queue.beginBatch`.
- `decide` returns `Action[]`; `resolve` applies them and builds a `ResolveContext` (speech/offer maps).
- Cross-entity interactions (speech, trade offers) land on `perceived.incomingSpeech` / `perceived.tradeOffers` for the *next* tick — never same-tick.

## Cross-entity memory graph (`graph-memory.ts`)
- `emit()` auto-inserts `speech`, `trade`, `tax` events into `world.memoryGraph` (other kinds stay in the linear event log only).
- Indexed by subject, object, and kind for O(1) candidate lookup. Search scores by token-overlap IDF + recency (200-tick decay window).
- Pruned every 50 ticks: TTL 600 ticks, hard cap 5 000 facts.

## Deterministic RNG
- `createRng(seed)` — mulberry32. Seed is passed at world creation; same seed → identical run.
- `world.rng` is the single shared instance. All stochastic decisions draw from it in deterministic order.
- Tests pass an explicit seed; the app uses `Date.now()` for variety.

## Ontology guardrail (runtime)
- If `reasoner` is loaded and `.status().loaded`, `decide()` calls `reasoner.canEntityRunBehavior()` per chosen behavior.
- Violations increment `world.policyViolations`, emit `policy_violation`, and replace the action with `noop`.

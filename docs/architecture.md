# Ocean World — Architecture map

This is the "where does the simulation stuff actually plug in" view. Read top-to-bottom; each section names files so you can jump in and grep.

## One tick, end to end

The whole simulation is driven by one function: `runTick(world, REGISTRY, options)` in `src/simulation/tick.ts`. Everything else hangs off of it.

```
   App.tsx (setInterval, BASE_INTERVAL_MS / speed)
        │
        ▼
   runTick(world, REGISTRY, { t3Queue, reasoner })
        │
        ├─ world.tick++
        ├─ updateActiveRegion(world)            ← player position → world.activeRegionId
        ├─ ambientFrame = tick % 10 === 0       ← throttle for non-active regions
        │
        ├─ maybeRunScenario(world)              ← scenario events fire (price shock, etc.)
        ├─ expireActiveScenario(world)
        │
        ├─ perceive(world, ambientFrame)        ← entity.perceived.nearbyIds = findNearby(...)
        │     · skips frozen NPCs
        │     · findNearby filters by perceiver region (symmetric)
        │
        ├─ actions = decide(world, REGISTRY, t3Queue, reasoner, ambientFrame)
        │     · player skipped (input-driven)
        │     · frozen NPCs skipped
        │     · ACTIVE: T3 → T2 → ontology guard → action
        │     · AMBIENT: T2 → ontology guard → action  (no T3 escalation)
        │
        ├─ ctx = resolve(world, actions)        ← apply moves, queue speech/trades
        ├─ applyPerceivedInputs(world, ctx)     ← deliver speech/trades for next tick
        ├─ passiveDecay(world, ambientFrame)    ← energy decay; frozen NPCs unaffected
        └─ t3Queue.beginBatch(world)            ← non-blocking LLM batch (active region only)
```

## What each subsystem owns

| Subsystem | File | Role | Touched by |
|---|---|---|---|
| **ECS data** | `simulation/components.ts`, `entity.ts` | Pure-data shapes — physical, cognitive, financial, inventory, memory, perceived | All phases read/write |
| **Archetypes** | `simulation/archetypes.ts` | NPC factory + `spawnPlayer` | `scenarios/*` at world build |
| **Behaviors** | `behaviors/registry.ts` + `behaviors/*.ts` | Per-behavior `score()` (T2 fitness) + `decide()` (T1 action) | `decide` phase |
| **T3 LLM** | `llm/t3-queue.ts`, `llm/fireworks-*.ts`, `llm/prompt.ts`, `llm/stub-client.ts` | Async LLM deliberation queue | `decide` queues; `runTick` end batches |
| **Ontology reasoner** | `ontology/oxigraph-reasoner.ts` | SPARQL guard: archetype ⇒ component ⇒ behavior | `decide` phase, every chosen behavior |
| **Graph memory** | `simulation/graph-memory.ts`, `surreal-graph-memory.ts` | Cross-entity event graph for T3 retrieval | `emit()` writes; T3 prompts read |
| **Scenarios** | `simulation/scenarios.ts` | Random world events (price shock, festival, etc.) | `runTick` invokes; scenario fns mutate world |
| **Regions** | `simulation/regions.ts` + gating in `world.ts`/`tick.ts` | Map tiling + active/ambient/frozen classifier | All phases gate; renderer clamps camera |
| **Renderer** | `renderer/PixiStage.tsx` | World→screen, camera follow, per-entity gfx | Reads `snapshot(world)` + `getCameraBounds()` |
| **UI panels** | `ui/Inspector.tsx`, `ui/DeliberationsPanel.tsx`, `ui/OntologyPanel.tsx` | React side panels | Read world refs each renderTick |

## Data flow for a single NPC decision

Take a Merchant deciding what to do this tick. Here's every system that touches them:

```
1. perceive():
   → findNearby(world, merchant, perceptionRadius)
     → filtered by merchant's region  (regions.ts)
   → merchant.perceived.nearbyIds updated

2. decide():
   → entityActivity(world, merchant, ambientFrame)
     → "active" / "ambient" / "frozen"  (regions.ts gate via world.ts)
   → if t3Queue has resolved action for merchant: use it (LLM ran in a prior tick)
   → otherwise evaluateBehavior():
     → for each behavior in merchant.behaviors:
        REGISTRY[name].score(merchant, world)        ← T2 fitness
     → multiply by valueWeight(merchant.values, name) ← character traits
     → pick best
   → reasoner.canEntityRunBehavior(merchant, behavior)  ← ontology guard
   → if score < threshold OR forced T3 cadence:
     → t3Queue.queue(merchant.id)                   ← LLM batch later this tick
     → actions.push(REGISTRY[behavior].decide(...))  ← T1 fallback so the tick stays alive

3. resolve():
   → applyMove / applySpeak / handleTrade / settleTrade
   → emit(world, event)
     → mirrors into world.memoryGraph (cross-entity graph)  ← read by future T3 prompts

4. applyPerceivedInputs():
   → if anyone spoke to merchant: merchant.perceived.incomingSpeech filled
   → merchant.memory.recent ring buffer appended

5. passiveDecay():
   → merchant.physical.energy -= 0.002

6. End of tick: t3Queue.beginBatch(world)
   → For all queued entities, render prompt context including their nearby +
     recent memory + relevant facts from memoryGraph (graph-memory retrieval).
   → POST to Fireworks /chat/completions.
   → On response, parsed action lands in t3Queue's resolved map for the next
     tick's decide() to consume.
```

## Region gating overlay

Region gating is a *cross-cutting filter* applied at three points; it doesn't replace any subsystem.

```
                  ┌──────────────────────────────────┐
                  │  perceive (region gate)          │
                  │  decide   (region gate, T3 gate) │
                  │  passiveDecay (region gate)      │
                  └────────┬─────────────────────────┘
                           │
                  entityActivity(world, e, ambientFrame)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           active       ambient       frozen
       (every tick)  (every 10th)   (skip)
       full T1+T2+T3   T2 only       (no work)
```

`findNearby` applies the same logic *symmetrically* from the perceiver's side: each entity sees only its own region's neighbours. This holds for active *and* ambient NPCs — Old Fields NPCs see other Old Fields NPCs even when the player is in Town Square.

## Where the player plugs in

The player is an Entity in `world.entities`, but with a small contract:
- Archetype `"Player"`, `behaviors: []`, `id: PLAYER_ID = "player"`
- Skipped in `decide` and `passiveDecay` — no behaviors run, no fatigue
- `physical.x/y` mutated directly by App.tsx's RAF input handler (decoupled from sim tick)
- Has `perceived` so NPCs can speak/trade *toward* the player (player collects them in `incomingSpeech`/`tradeOffers`)
- The camera follows them — `getCameraBounds()` returns the player's current region

**Player-emitted actions** (E key to greet) bypass the T1/T2/T3 pipeline by
calling helpers in `simulation/player-actions.ts` directly between ticks:

```
input handler (App.tsx)
       │
       └─► playerSpeak(world, targetId, msg)
                │
                ├─ target.perceived.incomingSpeech.unshift(...)   ← priority over NPC chatter
                ├─ world.speechBubbles.set(player, ...)            ← visible bubble
                └─ emit(world, { kind: "speech", source: PLAYER }) ← logged + graphed
                                                                       (T3 prompts recall it)
```

NPCs respond on the *next* tick because Converse's `score()` returns 0.8 when
`perceived.incomingSpeech.length > 0`, so it usually wins T2 and replies via
`registry[Converse].decide()` → `applySpeak`. The reply bubble appears above
the NPC; the player's `incomingSpeech` collects the reply for any future
"chat log" UI.

## Where the long-term vision plugs in

| Roadmap stage | Where it'll attach |
|---|---|
| **3 Player↔NPC interaction** | New input keys → emit player-sourced actions into `resolve()`; surface `perceived.incomingSpeech` in the UI |
| **4 Discrete maps (Shape B)** | Multiple `World` instances; transitions swap which world `runTick` operates on; SurrealDB graph stays global |
| **5 Real-world feeds** | New "T4" pre-tick phase that converts external signals into scenario events via `maybeRunScenario`'s same path |
| **6 Predictions** | New component on entities (`expectations: Map<string, ...>`); compared against actuals in a new post-tick phase; values updated based on prediction error |
| **7 Internal worlds** | Each NPC carries a small "model of the world" component; T3 prompts read from this model rather than ground truth |
| **8 Multi-tier** | More tiers stacked on each region — physical (now), social, market, governance — each with its own behaviors + scoring |
| **9 MMO** | World becomes server-authoritative; current App.tsx becomes one client view |

The recurring property: **adding a new tier or signal type usually means adding a phase function to runTick, a component to entities, or a new `kind` to scenarios. Few cross-cutting rewrites.** That's by design.

# Ocean World — Roadmap

The long-term aim, in the user's framing: an MMO-multi-tiered "video game version of Mirror Fish" — a world populated mostly by bots that talk and trade with each other, ingest signals from the real world, make predictions on those signals, fold the predictions back into their internal model, and let that loop change how they operate.

The simulation we have today is the embryo of that. Everything below is sequenced from "we have it" to "this needs research."

## Stages

### Stage 0 — Living simulation (done)
- ECS + T1/T2/T3 tick loop, registry-driven, PixiJS renderer
- Archetypes (Person/Merchant/Wanderer/MarketMaker/Lawkeeper) with values, behaviors, perception
- Cross-entity graph memory (SurrealDB) for "who taxed me, who I sold to" recall
- Oxigraph SPARQL reasoner gating behaviors against ontology contracts
- T3 LLM deliberation via Fireworks (Kimi router) — graph-aware prompts
- Deterministic seeded scenarios, scenario events, deliberation panel

### Stage 1 — Player presence (done)
- Player as a no-behavior entity, free pixel movement (WASD/arrows)
- Camera follow with ease + dead zone
- World decoupled from viewport (2400×1600 world, 1100×700 viewport)

### Stage 2 — Region-gated simulation, "Shape A" (done)
- World tiled into named regions; the active region runs full T1/T2/T3
- Camera clamped to active region — each region behaves like its own screen
- `findNearby` is perceiver-relative — every entity sees only its own region
- Active region label in header

### Stage 2.5 — Ambient ticking (done)
- Inactive regions tick every 10th step at T2-only fidelity (no LLM cost)
- NPCs in other regions wander, trade, and gossip while the player is away —
  the world keeps living, just slower and without LLM deliberation
- Cross-entity graph memory keeps recording, so when you return their stories
  have moved on
- Cost ceiling: full-rate work scales with active region only; ambient work is
  bounded by `1/AMBIENT_TICK_INTERVAL × non-active NPCs`

### Stage 3 — Player ↔ NPC interaction (done)
- **Greet**: E opens an interaction menu near the nearest NPC in 80px range;
  pressing 1 sends a randomised opener via `playerSpeak`. NPCs' `Converse`
  replies via the existing pipeline; exchanges land in the graph memory so
  future T3 prompts recall them
- **Inspect**: 2 in the menu selects the target in the right-pane Inspector
- **Walk away**: Esc (or walking out of range) closes the menu
- **Chat tab**: third tab in the right pane filters `world.events` for
  speech and trade events involving the player; clicking an NPC's name in
  the chat jumps to their Inspector card
- **Trade**: player has a wallet (`financial: {money: 100, goods: 0}`) shown
  as a header pill. When an NPC trades toward the player, a yellow prompt
  appears at the bottom of the canvas — Y settles the trade via
  `playerAcceptTrade`, which atomically swaps money/goods, sets visible
  bubbles, and emits a `trade` event into the graph memory
- **Discoverability**: header hint reads
  `WASD/arrows · E greet · Y accept · click to inspect`

### Stage 4 — Discrete maps, "Shape B"
- Multiple `World` instances, swapped on transition triggers (doorways, edge tiles)
- Each map: own scenario, NPC roster, bounds, themes
- Persistent cross-map graph memory (already global via SurrealDB)
- Fade / cut transitions; spawn points on each map
- Resource cost scales with active map only — true Pokémon architecture

### Stage 5 — Real-world signal ingestion
- A new T-layer (call it T4 or "feeds") that pulls real-world data — news headlines, weather, prices, social sentiment — and converts them into world events
- Feeds fan out as scenario-style events into the relevant regions (e.g. a price-shock feed hits Market Row, a weather feed hits Driftwood Coast)
- NPCs react via existing perception + T3 — no new decision pipeline, just new stimuli

### Stage 6 — Predictive cognition
- NPCs accumulate a private "expectations" store: their predicted next state of nearby entities, prices, or events
- Each tick, predictions are scored against what actually happened
- Prediction error feeds back into values (curiosity rises after surprises, fairness falls after repeated betrayals, etc.)
- Stretches T3 into a forecasting role rather than just a reactive one

### Stage 7 — Recursive internal worlds
- Each NPC maintains a small internal model of the world they think they live in (other NPCs' likely values, region states, market trends)
- Decisions are made against this internal model, not the ground-truth world
- Internal models drift, sometimes converge with reality, sometimes don't — and that drift is itself part of NPC personality
- "Mirror Fish" framing: the bots are mirrors of a shared external signal, but each one warps it through its own values + history

### Stage 8 — Multi-tier world
- Layered simulations stacked on the same regions: physical (movement, trades), social (alliances, gossip), market (price discovery, scarcity), governance (laws, enforcement)
- Behaviors at higher tiers read state from lower ones; lower tiers are bounded by laws set at higher ones
- A region might have a strong governance layer (Lawkeeper-dense town) or a thin one (Driftwood Coast)

### Stage 9 — MMO substrate
- Multiple human players sharing a world
- Each player can claim a region as their "home" — like a player-resident among bots
- Player actions enter the same graph memory NPCs recall against
- Persistence + sync (server-side world authoritative; clients render snapshots)
- Schedules: world keeps ticking when no human is online; bots run continuously

## Cross-cutting concerns

- **Cost control**: T3 LLM spend grows with active-region NPC count. Region gating (Stage 2) is the first lever; per-region force-T3 intervals and stub fallbacks for tier-0 chatter are the next ones.
- **Determinism**: seeded RNG is already in place; replays should be possible. As real-world feeds enter (Stage 5), capture the feed snapshot alongside the seed for replayable runs.
- **Ontology growth**: every new tier (predictive, internal-world, governance) adds components + behaviors. The codegen + Oxigraph reasoner pipeline already validates this — keep adding ontology before code, not after.
- **Privacy**: real-world feeds (Stage 5) should never carry PII into NPC memory. Strip before insert into the graph.

## Open questions to revisit

- Does "Mirror Fish" warrant a literal mirror metaphor — NPCs that reflect each other's values back, with distortion? Or is it broader?
- For Stage 9 MMO: authoritative server in Bun? Edge functions? P2P with CRDT for the graph memory?
- For Stage 7 recursive internal worlds: how deep does the recursion go before it stops paying back? One tier of "what I think you think" is probably enough.

# Ocean World — Tactical Roadmap (100 items)

Complement to the strategic `ROADMAP.md` (Stages 0–9). This file is the
tactical breakdown: 100 specific items grouped into 6 phases by payoff vs cost.

> **Note on duplicates:** A4 (tile-based ground) and C26 are the same
> deliverable, counted once under #26. So the list is 99 distinct items in
> 100 slots.

## Phase summary

| Phase | Theme | Length | Items | Outcome |
|-------|-------|--------|-------|---------|
| 1 | Visual baseline | 3–4 hrs | 7 | Demo no longer looks like a tech sketch |
| 2 | Populated world | ~1 wk | 18 | Screenshots show life and variety |
| 3 | UX + sim correctness | ~2 wks | 53 | Game loop is testable and fun to drive |
| 4 | Emergent ontology (the moat) | ~3 wks | 12 | Mirror-Fish-beating differentiation |
| 5 | Multi-region depth | ~1 wk | 4 | Visible biome distinctness |
| 6 | MMO foundations | ongoing | 4 | Server-authoritative + multi-player |

---

## Phase 1 — Visual baseline (3–4 hrs)

**Goal:** A 30-second video reads as "indie pixel-art game", not "ECS demo".
Detailed implementation plan in `plan-phase-1.md`.

| # | Item | LoC | Why now |
|---|------|-----|---------|
| 6 | Lerp positions between sim ticks | ~30 | Foundation — everything looks better against smooth motion |
| 26 | Tile-based ground (TilingSprite) | ~40 + 1 tile fetch | Biggest screenshot delta of any single change |
| 3 | Drop-shadow under sprites | ~10 | Sprites stop floating |
| 13 | Z-sort by y | ~10 | Front/back occlusion correct |
| 1 | Hysteresis on direction snap | ~15 | Diagonals stop strobing |
| 5 | Per-instance palette variation | ~1 hr | Solves "60 identical Persons" |
| 11 | Speech-bubble tails + polish | ~50 | Last "tech demo" UI element |

**Exit criteria:** screenshot a 5-NPC scene; hand it to a friend; if they say
"oh, a game" instead of "what's this?", you're done.

---

## Phase 2 — Populated world (~1 wk)

**Goal:** Screenshots show ambient life and variety. NPCs feel like inhabitants,
not particles.

| # | Item |
|---|------|
| 2 | Subtle 1px idle bob |
| 7 | Footstep dust particles |
| 12 | Selection ring glow + hover pulse |
| 14 | Energy bar gradient (green→yellow→red) |
| 16 | Shift = run (1.6× speed) |
| 18 | Camera lookahead 30px in motion direction |
| 19 | Region-transition crossfade |
| 27 | Static decoration: trees, rocks, signposts |
| 32 | Ambient idle objects: waving flags, smoke |
| 34 | Per-region ambient SFX bed |
| 36 | Inspector portrait (cropped sprite) |
| 39 | World-time HUD: day + clock |
| 44 | Region label crossfade on transition |
| 46 | In-range indicator: glow on E-key target |
| 54 | Gossip behavior — NPCs retell with decay |
| 58 | Schedule behavior — daily home/market/work |
| 88 | Vite plugin: auto-copy sprite-forge output |
| 89 | `npm run pull-lpc` from manifest |

**Exit criteria:** 30s video shows NPCs having visible routines and chatter
without player intervention.

---

## Phase 3 — UX + sim correctness (~2 wks)

**Goal:** The game loop is testable, profilable, and fun to drive. Trades and
conversations feel like first-class systems.

### Visual / juice
| # | Item |
|---|------|
| 8 | Particle bursts on trade success / speech |
| 9 | Day/night canvas tint cycle |
| 15 | Camera shake on scenario events |

### Input / motion
| # | Item |
|---|------|
| 17 | Acceleration easing on player |
| 20 | Walking sound synced to step frames |
| 21 | Reset animation phase on direction change |
| 22 | Idle "fidget" every ~8s (reuse spellcast row 0) |
| 23 | Bump-into-bound 1px push-back |
| 24 | Sprite tint flash on damage / surprise |
| 25 | Stop-animation interp (ease frame 0 over 100ms) |

### World
| # | Item |
|---|------|
| 28 | Building footprints with collision |
| 30 | Region boundary signposts |
| 31 | Five distinct biomes (Town Square / Market Row / Driftwood / Garrison / Wilds) |
| 33 | Lit windows after dusk |
| 35 | Per-tile audio zones |

### UI / inspector
| # | Item |
|---|------|
| 37 | Hover-to-peek without selecting |
| 38 | Conversation log (chat-style transcript) |
| 40 | Mini-map with regions + entities |
| 41 | Quest/goal indicators above NPCs |
| 42 | Trade UI (sliders for goods/money) |
| 43 | Player inventory panel |
| 45 | Filterable archetype legend |

### Player interaction
| # | Item |
|---|------|
| 47 | Whistle/shout broadcast |
| 48 | Befriend → NPC follows for N ticks |
| 49 | Gift item, watch values shift |
| 50 | Pin memory — write to graph |
| 51 | Player can place stalls |
| 52 | Free-text player speech |
| 53 | Eavesdrop mode (radius bubbles) |

### Behaviors
| # | Item |
|---|------|
| 55 | Group up at low energy |
| 56 | Avoid (fairness-low NPCs steer around Lawkeepers) |
| 57 | Pursue (Lawkeeper chases highest-violation NPC) |
| 59 | Memory weights (recency bias) |
| 60 | Reputation propagation through gossip |
| 61 | Mood modifiers (hungry/tired/suspicious) |
| 62 | Cohort coordination (Merchants align prices) |
| 63 | Defection thresholds (fairness < 0.3 cheats) |
| 64 | Crowd contagion (panic spread) |
| 65 | Long-term saving toward goals |

### Sim correctness & profiling
| # | Item |
|---|------|
| 66 | T3 budget per region with backpressure |
| 67 | Replay system (seed + scenario events → bit-exact) |
| 68 | A/B scenario runner (same seed, two T3 models) |
| 69 | Slow-motion mode (0.25×) |
| 70 | Per-tick T1/T2/T3 profiler sparkline |
| 71 | NPC density auto-tuner per region |
| 72 | Death/birth events with graph cleanup |
| 73 | Energy as full metabolism (food/rest/work) |
| 74 | Conservation-law audit (money in = money out) |
| 75 | Behavior cooldowns to stop thrash |
| 76 | Decision-determinism test suite |
| 77 | T3 cost/quality dashboard |

### Tooling
| # | Item |
|---|------|
| 90 | Vitest tests for sprite-atlas + pickAnimation |
| 91 | CI: typecheck + tests on push |
| 92 | PixiStage refactor: extract `renderEntity()` |

**Exit criteria:** the sim has a determinism-replay green test; T3 cost is
graphed; an outsider can drive a 5-min session that feels like an actual game.

---

## Phase 4 — Emergent ontology (~3 wks)

**Goal:** The moat. Capabilities Mirror Fish (and any LLM-NPC sim) doesn't have:
versioned schema, NPC-driven taxonomy, schism detection, story extraction.

### Ontology evolution
| # | Item |
|---|------|
| 78 | Versioned ontology snapshots — diff between codegens |
| 79 | Emergent vocabulary — promote NPC-coined words to ontology terms |
| 80 | NPC-driven taxonomy — auto-classify observed objects/events |
| 81 | Meta-rules — NPCs propose local rules → Oxigraph constraints |
| 82 | Schism detection — value-clusters become inferred faction components |
| 83 | Norm emergence tracking — % followers of norm Y per day |
| 84 | Ontology drift visualiser — animate schema over N ticks |
| 85 | Constraint violation graph — who tripped which rule |
| 86 | Story extraction — daily auto-newspaper (T3 task) |
| 87 | Memetic propagation — heat-map of player-injected words spreading |

### Tooling
| # | Item |
|---|------|
| 93 | Component-scoped CLAUDE.md per directory |
| 94 | Bundle-size budget — fail CI if dist grows >X kB |

**Exit criteria:** 1000-tick run produces (a) at least one new ontology term
not in seed, (b) at least one detected faction, (c) a coherent newspaper.

---

## Phase 5 — Multi-region depth (~1 wk)

| # | Item |
|---|------|
| 10 | Weather: rain particles, banner sway |
| 29 | Water/ocean tiles in Driftwood Coast (animated) |
| 95 | Publish sprite-forge as npm package |
| 96 | Region edge transitions with prefetch (no stutter) |

**Exit criteria:** crossing region edges feels seamless; biomes are
visually identifiable from a screenshot.

---

## Phase 6 — MMO foundations (ongoing)

| # | Item |
|---|------|
| 97 | Authoritative server (Bun + WS) running sim, clients render snapshots |
| 98 | Multiple human players sharing one world |
| 99 | Delta snapshot replication |
| 100 | CRDT for cross-entity graph memory |

**Exit criteria:** two laptops on a LAN see the same world; both can drive a
player; both writes converge in the graph.

---

## Cross-cutting tooling backlog

These can land any time; not gated by a phase:

- **#88** Vite plugin: auto-copy sprite-forge output → public/ on rebuild
- **#89** `npm run pull-lpc` reading a JSON manifest of LPC files
- **#90** Vitest for sprite-atlas + pickAnimation
- **#91** GitHub Actions: typecheck + test on push
- **#92** Refactor PixiStage render() — extract `renderEntity(snap, gfx)`
- **#93** Component-scoped CLAUDE.md (renderer/, simulation/, ontology/)
- **#94** Bundle-size budget guardrail in CI
- **#95** Publish sprite-forge to npm

---

## Reading order

If you're picking up this project cold:

1. Read root `ROADMAP.md` for the strategic frame (Stages 0–9)
2. Read `docs/architecture.md` for the system shape
3. Read this file for the tactical breakdown
4. Read `docs/plan-phase-1.md` for the next-three-hours work plan

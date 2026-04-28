# Ocean World — Wave 1 Execution Plan

> Full analysis of remaining roadmap-100 items: parallelization strategy, DAG, worktree splits, and ROI tiers.
> Generated: 2026-04-27

## Status Summary

### Delivered (merged to main)

| Batch | Items | Count |
|-------|-------|-------|
| Phase 1 — Visual baseline | #6, #26, #3, #13, #1, #5, #11 | 7 |
| Quick Wins | #91, #88, #89, #93, #74, #76, #40, #38, #78, #54 | 10+1 |

**ROADMAP Stages 0–3**: Complete.

---

## Remaining Items — File Collision Groups

Every item touches at least one file. Parallel worktrees must avoid writing to the same file simultaneously.

### Group R — PixiStage.tsx (~26 items)

All renderer-only. No sim code touched.

| Item | Effort | Description |
|------|--------|-------------|
| **#2** idle bob | 5 min | 1px vertical sine offset on sprite position |
| **#7** footstep dust | 15 min | Tiny particle puffs on walk frame change |
| **#8** particle bursts on trade/speech | 15 min | Same particle system, triggered by event |
| **#9** day/night canvas tint | 10 min | Overlay rect with alpha cycling on tick count |
| **#12** selection ring glow + pulse | 10 min | Animate ring alpha/flicker |
| **#14** energy bar gradient | 5 min | Green→yellow→red fill color calc |
| **#15** camera shake on scenario | 15 min | Random offset on worldLayer.position |
| **#17** acceleration easing (player) | 10 min | Lerp player velocity instead of instant snap |
| **#18** camera lookahead | 10 min | Offset target pos 30px in move direction |
| **#19** region-transition crossfade | 20 min | Fade overlay on region change |
| **#21** reset anim phase on direction change | 5 min | Already half-done in pickAnimation |
| **#22** idle fidget | 15 min | Reuse spellcast row 0 every ~8s idle |
| **#23** bump-into-bound push-back | 5 min | Clamp with visual nudge (logic exists in tick.ts) |
| **#24** sprite tint flash | 5 min | Brief tint overlay on damage/surprise |
| **#25** stop-animation interp | 10 min | Ease to frame 0 over 100ms |
| **#27** static decorations | 20 min | Render benches, crates, flora in regions |
| **#30** region boundary signposts | 20 min | Render gate posts at region edges |
| **#32** ambient idle objects | 30 min | Waving flags, smoke particles |
| **#33** lit windows after dusk | 15 min | Small yellow rects when day/night says dark |
| **#41** quest/goal indicators | 15 min | ! or ? above NPCs |
| **#44** region label crossfade | 10 min | Text fade-in/out on boundary cross |
| **#46** in-range indicator | 10 min | Glow on E-key target when in range |
| **#53** eavesdrop mode | 15 min | Radius circle visualization |
| **#92** extract `renderEntity()` | 20 min | Refactor: pull per-entity render loop into own method |

**Total: ~4–5 hrs for a renderer-focused agent.**

### Group S — Simulation (~17 items)

tick.ts, entity.ts, components.ts, world.ts, src/behaviors/*.

| Item | Effort | Description |
|------|--------|-------------|
| **#55** group up at low energy | 20 min | Wander variant: steer toward same-archetype |
| **#56** avoid (low-fairness steer around Lawkeepers) | 20 min | Repulsion vector in applyMove |
| **#57** pursue (Lawkeeper chases violators) | 30 min | New behavior |
| **#58** schedule behavior | 90 min | Day-phase driven movement (complex) |
| **#59** memory weights (recency bias) | 15 min | Weight recent memories higher in T3 prompt |
| **#60** reputation through gossip | 30 min | Track rep per entity, gossip spreads it |
| **#61** mood modifiers | 30 min | Values get temporary deltas |
| **#62** cohort coordination (Merchants align) | 30 min | Price signal averaging |
| **#63** defection thresholds | 20 min | Fairness < 0.3 → cheat behavior |
| **#64** crowd contagion | 30 min | Panic spread proximity |
| **#65** long-term saving | 30 min | NPCs accumulate toward goals |
| **#66** T3 budget per region | 20 min | Max LLM calls/region/tick |
| **#67** replay system | 45 min | Capture seed + scenario events for bit-exact replay |
| **#71** NPC density auto-tuner | 30 min | Spawn/despawn based on region population |
| **#72** death/birth events | 45 min | NPC lifecycle with graph cleanup |
| **#73** full metabolism | 30 min | Food→energy, rest→recovery cycle |
| **#75** behavior cooldowns | 10 min | Prevent thrash between behaviors |

**Total: ~8–10 hrs for a sim-focused agent.**

### Group U — UI + App.tsx (~14 items)

| Item | Effort | Description |
|------|--------|-------------|
| **#16** shift=run | 10 min | Speed multiplier on Shift key + UI hint |
| **#36** inspector portrait | 20 min | Cropped sprite in Inspector |
| **#37** hover-to-peek | 15 min | Show name/title on hover without selecting |
| **#39** world-time HUD | 15 min | Day count + clock display |
| **#42** trade UI (sliders) | 45 min | Goods/money sliders for player trade |
| **#43** player inventory panel | 20 min | Show what player carries |
| **#45** filterable archetype legend | 20 min | Checkbox list to hide/show archetypes |
| **#47** whistle/shout broadcast | 15 min | Key press → emit speech to all nearby |
| **#48** befriend → NPC follows | 30 min | Toggle behavior when befriended |
| **#49** gift item | 15 min | Give goods to NPC, watch values shift |
| **#50** pin memory (write to graph) | 15 min | Player writes a fact to graph |
| **#52** free-text player speech | 20 min | Text input → playerSpeak |
| **#69** slow-motion (0.25×) | 5 min | Another speed setting |
| **#70** per-tick profiler sparkline | 30 min | T1/T2/T3 timing bar graph |

**Total: ~4–5 hrs for a UI agent.**

### Group T — Tooling (~4 items)

| Item | Effort | Description |
|------|--------|-------------|
| **#68** A/B scenario runner | 45 min | Same seed, two T3 models, diff output |
| **#90** sprite-atlas tests (finish) | 20 min | Vitest for pickAnimation + atlas |
| **#94** bundle-size budget CI | 15 min | Fail CI if dist > X kB |
| **#95** publish sprite-forge to npm | 60 min | Package + publish pipeline |

**Total: ~2 hrs.**

### Phase 4 — Emergent Ontology (9 items, ~12–15 hrs)

| Item | Effort | Description |
|------|--------|-------------|
| **#79** emergent vocabulary | 90 min | NPC-coined words → ontology terms |
| **#80** NPC-driven taxonomy | 120 min | Auto-classify observed objects/events |
| **#81** meta-rules (NPCs propose rules) | 120 min | → Oxigraph constraints |
| **#82** schism detection | 90 min | Value-clusters → faction components |
| **#83** norm emergence tracking | 60 min | % followers of norm Y per day |
| **#84** ontology drift visualiser | 90 min | Animate schema over N ticks |
| **#85** constraint violation graph | 60 min | Who tripped which rule |
| **#86** story extraction (newspaper) | 90 min | Daily T3 task → auto-newspaper |
| **#87** memetic propagation heat-map | 60 min | Player-injected words spreading |

### Phase 5 — Multi-region Depth

Blocks on Stage 4 (discrete maps). Some items can ship on current single map:

- **#10** weather: rain particles, banner sway (~45 min, PixiStage)
- **#29** water/ocean tiles (~30 min, PixiStage)
- **#95** publish sprite-forge (~60 min)
- **#96** region edge transitions with prefetch (~60 min)

### Phase 6 — MMO Foundations

- **#97** websocket multiplayer sync
- **#98** authority server for tick arbitration
- **#99** player accounts + auth
- **#100** live-ops admin panel

---

## Dependency DAG

```
LAYER 0 — PURE PARALLEL (4 worktrees, zero file conflicts)
┌───────────────────┬────────────────────┬──────────────────┬──────────────────┐
│ RENDERER          │ SIMULATION         │ UI               │ TOOLING          │
│ #2, #7, #9, #12, │ #55–57, #59, #61,  │ #16, #36, #37,   │ #68, #90, #94    │
│ #14, #15, #17,   │ #62, #65, #66,     │ #39, #43, #45,   │                  │
│ #18, #21, #22,   │ #67, #71, #72,     │ #47, #49, #50,   │                  │
│ #23, #24, #25,   │ #73, #75           │ #52, #70         │                  │
│ #44, #46, #53    │                    │                  │                  │
└───────────────────┴────────────────────┴──────────────────┴──────────────────┘

LAYER 1 — DEPENDS ON LAYER 0 OR SHARES FILES
│ #19 region crossfade    #58 schedule behavior    #42 trade UI         #95 publish
│ #30 signposts           #60 reputation           #48 befriend          #96 edges
│ #27 decorations         #63 defection            #69 slow-motion
│ #32 ambient objects     #64 crowd contagion
│ #33 lit windows
│ #92 renderEntity refactor
└──────────────────────────────────────────────────────────────────────────────┘

LAYER 2 — BLOCKS ON LAYER 1
│ #31 five distinct biomes (needs #27, #30, #19)
│ #35 per-tile audio (needs #31 biomes)
│ Phase 4 ontology items (needs #78 snapshots — already done)
└──────────────────────────────────────────────────────────────────────────────┘

LAYER 3 — BLOCKS ON STAGE 4 (discrete maps)
│ #96 region edge transitions with prefetch
│ Phase 5 full
│ Phase 6 MMO
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Low-Effort / High-Reward Tiers

Ranked by **payoff ÷ effort**.

### Tier S — <15 min, visible every second

| Item | Min | Why it matters |
|------|-----|----------------|
| **#2** idle bob | 5 | "Alive" feeling on every sprite |
| **#14** energy bar gradient | 5 | Green→yellow→red = readable at a glance |
| **#23** bump-into-bound | 5 | Stops "stuck" confusion at world edges |
| **#21** reset anim phase | 5 | Fixes visible direction-change glitch |
| **#24** tint flash | 5 | Damage/surprise becomes readable |
| **#69** slow-motion | 5 | Already have speed slider; add 0.25× |

### Tier A — 10–20 min, high visible lift

| Item | Min | Why it matters |
|------|-----|----------------|
| **#9** day/night tint | 10 | Immense atmosphere for 10 lines |
| **#18** camera lookahead | 10 | Feels dramatically smoother in motion |
| **#12** selection ring glow | 10 | Selection becomes satisfying |
| **#17** acceleration easing | 10 | Player movement stops feeling like a cursor |
| **#46** in-range indicator | 10 | Solves "can I interact?" ambiguity |
| **#16** shift=run | 10 | Makes exploration less tedious |
| **#44** region label crossfade | 10 | Region system feels polished |
| **#22** idle fidget | 15 | NPCs visibly alive when standing still |
| **#75** behavior cooldowns | 10 | Stops NPC behavior thrashing |
| **#25** stop-animation interp | 10 | Fixes "freeze-frame" on direction change |
| **#39** world-time HUD | 15 | World has a sense of passing time |
| **#37** hover-to-peek | 15 | Reduces UI friction significantly |
| **#49** gift item | 15 | Player↔NPC feels more real |
| **#47** whistle/shout | 15 | Simple interaction expansion |
| **#59** memory weights | 15 | Better T3 recall quality |
| **#66** T3 budget per region | 20 | Cost control before it becomes a problem |

### Tier B — ~30 min, solid feature

| Item | Min | Why it matters |
|------|-----|----------------|
| **#7** footstep dust | 15 | Satisfying micro-particle |
| **#8** particle bursts | 15 | Trade/speech feel eventful |
| **#30** signposts | 20 | Region boundaries readable |
| **#41** quest indicators | 15 | Clear what's interactive |
| **#53** eavesdrop mode | 15 | See what NPCs are discussing |
| **#15** camera shake | 15 | Scenario events have impact |
| **#73** full metabolism | 30 | Energy becomes a real system |
| **#55** group up | 20 | NPCs feel social |
| **#56** avoid | 20 | NPCs have preferences about each other |
| **#62** cohort coordination | 30 | Market feels like a market |
| **#50** pin memory | 15 | Player agency in the graph |
| **#43** player inventory | 20 | Track what you carry |
| **#45** archetype legend | 20 | Understand who's who |
| **#70** profiler sparkline | 30 | Debugability improvement |
| **#61** mood modifiers | 30 | Values become dynamic |

---

## Recommended Execution Waves

### Wave 1 — 3 Parallel Worktrees (Layer 0)

| Worktree | Items | Est. Time | Agent Category |
|----------|-------|-----------|----------------|
| **Renderer** | #2, #9, #12, #14, #17, #18, #21, #22, #23, #24, #25, #44, #46, #7, #8, #15, #53, #92 | ~3 hrs | `visual-engineering` |
| **Simulation** | #55, #56, #57, #59, #61, #62, #65, #66, #67, #71, #72, #73, #75 | ~4 hrs | `deep` |
| **UI + Tooling** | #16, #36, #37, #39, #43, #45, #47, #49, #50, #52, #68, #90, #94 | ~3 hrs | `deep` |

**Total: ~61 items across 3 worktrees in one parallel pass.**

### Wave 2 — Layer 1 (depends on Wave 1)

- **Renderer**: #19, #27, #30, #32, #33
- **Sim**: #58, #60, #63, #64
- **UI**: #42, #48, #69, #70

### Wave 3 — Layer 2

- **#31** five distinct biomes
- **#35** per-tile audio
- **Phase 4** ontology items (#79–87)

### Wave 4 — Layer 3 + Phase 5

- **#96** region edge transitions
- **#10** weather, **#29** water tiles
- Stage 4 discrete maps planning

---

## Notes

- **#92** (PixiStage refactor) should go LAST in the renderer worktree — all other PixiStage changes should land first, then the refactor consolidates them.
- **#58** (schedule behavior) is the single most complex sim item — 90 min, needs day-phase awareness in tick.ts.
- **#42** (trade UI) is the most complex UI item — 45 min, needs new component with slider state.
- Phase 4 items are high differentiation (the moat) but high effort. Consider after Waves 1–3 are stable.
- Phase 6 (MMO) is out of scope for now — needs infra planning before any code.

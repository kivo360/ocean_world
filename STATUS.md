# Ocean World — Status

**Snapshot:** 2026-05-14 (second refresh — post wave-1 recovery).

This file is the "where things stand right now" view. The other planning files
have different jobs:

| File | Role | Cadence |
|------|------|---------|
| `ROADMAP.md` | Strategic plan: what stages exist, which are done | Updated when a stage closes |
| `docs/roadmap-100.md` | Tactical 100-item breakdown by phase | Stable reference |
| `docs/plan-phase-1.md` | Detailed plan for the 7 Phase-1 visual-baseline items | Stable reference |
| `docs/quick-wins-10.md` | 10 Phase-1-independent quick wins, parallel-safe | Stable reference |
| `docs/plan-wave-1.md` | Wave-1 execution plan (renderer/sim/ui/tooling lanes) | Stable reference |
| `STATUS.md` (this file) | Current branches, in-flight worktrees, last commits, open questions | Update at session end |

Always read `ROADMAP.md` for "where are we strategically?" and this file for
"what's actually in flight right now?".

## ROADMAP progress

- Stages 0, 1, 2, 2.5, 3 — **done**
- Phase 1 (visual baseline, 7 items) — **done**, merged 2026-04-27
- Quick wins (10 items + 1 prep extract) — **done**, merged 2026-04-27
- Wave 1 — **done**, including the recovered simulation/tooling work plus lifecycle/metabolism, 2026-04-28 + recovery on 2026-05-14
- Wave 2 (visual baseline, biomes, audio, UI overlays) — **done**, merged 2026-04-28
- Stage 4 (discrete maps / Pokémon-style transitions) — **next strategic milestone**, not started
- Stages 5–9 — research-tier, see `ROADMAP.md`

## Branches

| Branch | Status | Last commit |
|--------|--------|-------------|
| `main` | active, tracks `origin/main`, clean | `65d81dd docs(status): refresh after wave-1 recovery` |

All four `wave1-*` branches and the `backup-pre-recovery` safety branch were deleted at the end of this session after the recovery was verified (typecheck clean, 125/125 tests, social behaviors wired). If anything turns out wrong, the deleted commit tips are still reachable via `git reflog` for ~30 days:

- `wave1-simulation` was at `b7dd349`
- `wave1-ui` was at `d9db6ce`
- `wave1-tooling` was at `ea43cd5`
- `wave1-integration` was at `4bf844f`
- `backup-pre-recovery` was at `3e216fb`

Remote: `git@github.com:kivo360/ocean_world.git` (public). Only `main` on origin.

Worktrees: only `ocean-world/` itself.

## What happened in this session (2026-05-14)

When picking up work after a ~2-week pause, audited the four `wave1-*` branches and discovered the wave-1 integration finish commit (`ae1f540` on `main`) had **deleted a large chunk of the wave-1 simulation/tooling work** that the per-item lane commits had landed earlier:

- 4 social-behavior modules (`avoid-lawkeepers`, `group-up`, `merchant-coordination`, `pursue-violators`)
- `src/simulation/replay.ts` (deterministic replay system)
- `tests/sprite-atlas.test.ts` (32 tests)
- `scripts/ab-scenario-runner.ts`
- `Entity.cooldowns` / `Entity.lastBehaviorTick` fields + ~130 lines of related tick.ts logic

Recovery (this session):

1. **`a9ddecd` — Revert of `ae1f540`.** Restored the deleted simulation + tooling files. Kept wave-2 additions (HoverPeek, in-range rings, day/night overlay, biomes, audio, minimap) by resetting `App.tsx` and `PixiStage.tsx` to their pre-revert state — wave-1 didn't change those files in a way we need to preserve.
2. **`3ed11e4` — Cherry-picked `b7dd349`** (lifecycle/metabolism systems from `wave1-simulation` tip).
3. **Dropped the agent-breadcrumb files** (`.branch-manifest.md`, `.sisyphus/evidence/integration/merge-log.txt|merge-stats.txt|qa-gates.txt`) that the revert tried to revive — those are wave-1 integration tracking artifacts, not real content.

Verification: `npx tsc --noEmit -p tsconfig.app.json` clean, `npx vitest run` → 125/125 passing including `sprite-atlas.test.ts` (32 tests) and the replay-determinism test.

## Wave-1 follow-up: visual polish + UI features recovered inline (2026-05-14 evening)

After an audit-everything pass, restored the remaining wave-1 work that had been stripped by the integration commit. Now on `main`:

**Renderer polish** (inlined in `PixiStage.tsx`, commit `1f0b483`):
- ✅ #2 Idle bob (per-entity vertical sine offset)
- ✅ #7 Footstep dust particles
- ✅ #12 Pulsing selection ring
- ✅ #14 Energy bar gradient
- ✅ #21 Animation transition frames (smooth idle return)
- ✅ #22 Idle fidget wobble
- ✅ #23 Bump-into-bound edge jitter

**UI features** (cherry-picked `d7e60d1` + `a1647ff`):
- ✅ #16 Shift = sprint
- ✅ #36 Inspector portrait (archetype-colored circle)
- ✅ #43 Player inventory panel (in Inspector)
- ✅ #45 Filterable archetype legend
- ✅ #47 Whistle/shout broadcast form
- ✅ #49 Gift item (handler wired)
- ✅ #50 Pin memory (handler wired)
- ✅ #52 Free-text "Say to nearest" input
- Day/night badge in header

**Deliberately skipped** (pure refactor — can be redone later if wanted):
- #92 `renderEntity()` extraction (wave-1 attempted, wave-2 inlined; current main keeps everything inline)

## Wave-1 never-started items: now implemented (2026-05-14 evening)

All Layer-1 items that were planned but had never been coded in any wave-1 commit are now done.

**Simulation:**
- ✅ #58 Schedule behavior — day-phase driven movement, archetype-specific routines across morning/noon/evening/night (`src/behaviors/schedule.ts`, commit `44129e8`)
- ✅ #60 Reputation through gossip — `CognitiveState.reputation` + propagation in `applySpeak` + boost in `settleTrade` (commit `04456c3`)
- ✅ #64 Crowd contagion — mood drifts 5% toward perceived-neighbor average each tick (commit `04456c3`)

**UI:**
- ✅ #42 Trade UI sliders — `TradePanel` with goods/money sliders + `playerOfferTrade` (commit `d52d36a`)
- ✅ #48 Befriend / NPC follows — `Entity.befriendedBy` field, Wander steers toward befriender (commit `d52d36a`)
- ✅ #69 Slow-motion — 0.25× speed button in Controls (commit `31649dd`)
- ✅ #70 Per-tick profiler sparkline — T1/T2/T3 timing capture + new `ProfilerSparkline` component (commit `376fa37`)

**Tooling:**
- ✅ #94 Bundle-size budget CI — restored `.github/workflows/ci.yml` and added `scripts/check-bundle-size.ts` with a 4.5 MB gzipped budget (commit `31649dd`)
- ⏭ #95 Publish sprite-forge to npm — deferred (requires npm account credentials)

## Open questions

1. **Stage 4 (discrete maps)** — still open. Start a `docs/plan-stage-4.md`?
2. **#95 Publish sprite-forge to npm** — needs your npm account credentials; tell me when you want to set that up.
3. **Carry-over: `#88` / `#38` scope drift** from the quick-wins round — never re-verified.

## How to resume in a new chat

1. Read `ROADMAP.md` for strategic context.
2. Read this `STATUS.md` for current branches + in-flight work.
3. `git worktree list` to confirm worktree topology.
4. `git log --oneline origin/main | head -20` to see what's recently landed.
5. If you're going to make changes, branch off `main` and update this file's "Branches" / "Open questions" sections at session end.

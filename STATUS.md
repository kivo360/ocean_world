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

| Branch | Status | Purpose |
|--------|--------|---------|
| `main` | active, tracks `origin/main`, clean | live development |
| `backup-pre-recovery` | local-only safety net | snapshot of main at HEAD before the 2026-05-14 recovery; delete after a session or two if recovery proves stable |
| `wave1-simulation` | local-only, content recovered | safe to delete |
| `wave1-ui` | local-only, content recovered | safe to delete |
| `wave1-tooling` | local-only, content recovered | safe to delete |
| `wave1-integration` | local-only, content recovered | safe to delete |

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

## Wave-1 features deliberately NOT recovered (deferred)

Renderer visual polish from the wave-1 plan that diverged from wave-2's approach. Skipped this session because merging the two visual paths in `PixiStage.tsx` needed too much hand-merging for what is non-critical polish. All are recoverable later as small inline additions:

| # | Feature | Where it lives in git |
|---|---------|------------------------|
| 2 | Idle bob (per-entity vertical sine offset) | `wave1-integration` `135665d` (renderEntity helper) |
| 7 | Footstep dust particles | same |
| 12 | Pulsing selection ring (alpha + radius oscillation) | same |
| 14 | Energy bar gradient (red→yellow→green) | same |
| 21 | Animation transition frames (smooth idle return) | same |
| 22 | Idle fidget wobble | same |
| 23 | Bump-into-bound edge jitter | same |
| 92 | `renderEntity()` extraction refactor | same (the helper itself) |

Re-introduce via small inline additions to `PixiStage.tsx`'s render loop; no need to re-extract the helper unless that refactor is wanted on its own merits.

## Open questions

1. **Delete the four `wave1-*` branches and `backup-pre-recovery`?** Content is all on main. Backup is safety net — usually fine to delete after a session or two. Wave-1 branches are now redundant.
2. **Stage 4 (discrete maps)** — still open. Start a `docs/plan-stage-4.md`?
3. **Wave-1 renderer polish (#2/#7/#12/#14/#21/#22/#23/#92)** — schedule as a follow-up polish pass?
4. **Carry-over: `#88` / `#38` scope drift** from the quick-wins round — never re-verified.

## How to resume in a new chat

1. Read `ROADMAP.md` for strategic context.
2. Read this `STATUS.md` for current branches + in-flight work.
3. `git worktree list` to confirm worktree topology.
4. `git log --oneline origin/main | head -20` to see what's recently landed.
5. If you're going to make changes, branch off `main` and update this file's "Branches" / "Open questions" sections at session end.

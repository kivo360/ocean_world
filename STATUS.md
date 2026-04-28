# Ocean World — Status

**Snapshot:** 2026-04-27 (evening) — read this first when picking up work.

This file is the "where things stand right now" view. The other planning files
have different jobs:

| File | Role | Cadence |
|------|------|---------|
| `ROADMAP.md` | Strategic plan: what stages exist, which are done | Updated when a stage closes |
| `docs/roadmap-100.md` | Tactical 100-item breakdown by phase | Stable reference |
| `docs/plan-phase-1.md` | Detailed plan for the 7 Phase-1 visual-baseline items | Stable reference |
| `docs/quick-wins-10.md` | 10 Phase-1-independent quick wins, parallel-safe | Stable reference |
| `STATUS.md` (this file) | Current branches, in-flight worktrees, last commits, open questions | Update at session end |

Always read `ROADMAP.md` for "where are we strategically?" and this file for
"what's actually in flight right now?".

## ROADMAP progress

- Stages 0, 1, 2, 2.5, 3 — **done**
- Phase 1 (visual baseline, 7 items) — **done**, all merged into `main`
- Quick wins (10 items + 1 prep extract) — **done**, all merged into `main`
- Stage 4 (discrete maps / Pokémon-style transitions) — **next strategic milestone**, not started
- Stages 5–9 — research-tier, see `ROADMAP.md`

## Branches

| Branch | Status | Last commit |
|--------|--------|-------------|
| `main` | active, only branch | `a41f4c4 quick win #38: Conversation log panel` (2026-04-27 16:09) |

Phase-1 and quick-wins branches: **fully retired** — local deleted, remote deleted, worktrees collapsed. Content preserved in `main` per `git cherry`.

Remote: `git@github.com:kivo360/ocean_world.git` (public).

Worktrees: only `ocean-world/` itself. Sibling worktrees `../ocean-world-phase-1/` and `../ocean-world-quick-wins/` were collapsed after merge.

## What landed in this round

Phase 1 (visual baseline):

| # | Item | Commit |
|---|------|--------|
| 6 | Lerp positions between sim ticks | `34fcd50` |
| 26 | Tile-based ground (TilingSprite + noise) | `6a8158e` |
| 1 | Walk-direction hysteresis | `8bfb87a` |
| 5 | Per-character palette variation | `8bfb87a` |
| 26/3/13/1/5/11 | Tile ground, drop-shadow, z-sort, hysteresis (re-applied), variants, bubble tails | `2402b91` |

Note: the agent bundled #3, #11, #13 (plus a re-application of #26/#1/#5) into one commit at the end of phase-1 instead of keeping them separate. All seven items are present, but the per-item commit discipline broke down at the finish.

Quick wins:

| # | Item | Commit |
|---|------|--------|
| T0 | Extract `buildWorldWithPlayer` to test-helpers (prep) | `ca8e5b3` |
| 89 | `npm run pull-lpc` from manifest | `8f385d0` |
| 91 | CI typecheck + tests on push | `33e5c95` |
| 88 | Vite plugin auto-copy sprite-forge output | `f4014a1` |
| 93 | Component-scoped CLAUDE.md | `020a92c` |
| 78 | Versioned ontology snapshots | `1354230` |
| 74 | Conservation-law audit | `8c9af19` |
| 76 | Decision-determinism test suite | `1344912` |
| 40 | Mini-map | `3f8d08a` |
| 54 | Gossip behavior | `984863a` |
| 38 | Conversation log panel | `a41f4c4` |

11 commits, all per-item. Quick-wins agent caught up on commit discipline by the end.

## Workflow conventions (validated this round)

- **Sibling worktrees** at `../ocean-world-{branch}/` worked — no file conflicts across branches even with two parallel Sisyphus loops.
- **One commit per item** worked when honored. Phase-1 broke this at the finish; quick-wins held to it. Lesson: write the discipline into the prompt and check `git log main..HEAD` mid-loop.
- **No PRs** were opened — both branches were rebased/cherry-picked straight onto `main` (commit SHAs got rewritten, content preserved per `git cherry`).

## Open questions

1. **Reconcile #88 / #38 scope drift?** Quick-wins #88 was specced as "vite plugin auto-copy sprite-forge output" — committed under that title. Need to read the diff to confirm scope matches the plan vs. ontology HMR. Same for #38 (specced "Conversation log panel" — landed under that title, but worth verifying).
2. **Stage 4 (discrete maps)** — start planning a `docs/plan-stage-4.md`?

## Resolved this session

- ✅ **Remote branches deleted.** `origin/phase-1` and `origin/quick-wins` removed from GitHub.
- ✅ **Phase 1 finish-line bundle (`2402b91`) reviewed** — only 3 files touched (PixiStage.tsx for #3/#11/#13, archetypes-variants.json for variant data, generate-fixtures.ts for fixture tweaks). No duplicate code paths from earlier per-item commits; the subject line over-tagged items but the diff itself is additive. Subject-line discipline is the only smell, cosmetic only.

## How to resume in a new chat

1. Read `ROADMAP.md` for strategic context.
2. Read this `STATUS.md` for current branches + in-flight work.
3. `git worktree list` to confirm worktree topology.
4. `git log --oneline origin/main | head -20` to see what's recently landed.
5. If you're going to make changes, branch off `main` and update this file's "Branches" / "Open questions" sections at session end.

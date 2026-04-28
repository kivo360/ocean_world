# Draft: Wave 1 Parallelization Audit

## Requirements (confirmed)
- Critique the existing Wave 1 planning documents and handoff.
- Generate a real execution plan for one wave only.
- Ensure parallel work can be split cleanly without file conflicts.
- Verify dependencies and file ownership are sound before worktree parallelization.

## Technical Decisions
- Planning output will be written under `.sisyphus/plans/`.
- Focus is Wave 1 from the existing remaining-items plan, not later waves.
- Goal is a conflict-aware execution plan suitable for parallel worktrees.
- Target wave confirmed: Remaining Wave 1 from `docs/plan-wave-1.md`.
- Optimization priority confirmed: safety over maximum concurrency.
- Test strategy confirmed: tests-after with agent-executed QA as the main gate.
- Item `#94` is removed from this wave.
- Default to a dedicated tooling micro-lane so UI and tooling stop sharing a branch unnecessarily.
- Default implementation assumptions to disclose in the plan:
  - `#17` is visual-only easing in `PixiStage.tsx`, not gameplay-velocity changes in `App.tsx`.
  - `#37` uses a React-positioned overlay, but still requires Pixi hover-state plumbing; treat it as an integration-tail item, not a pure UI task.
  - `#15` camera shake requires scenario-signal plumbing and should be treated as an integration-tail item, not a pure renderer task.
  - All implementation branches wait for a single integration checkpoint; no early merges to main.
  - `#68` and `#90` stay in scope, but run in a dedicated tooling micro-lane.
  - Out-of-scope despite related discussion: `#63`, `#64`, `#69`, `#70`, `#94`.

## Research Findings
- Existing docs identify three main Wave 1 domains: renderer, simulation, UI+tooling.
- Prior handoff claims the current plan is high-level and still needs executable per-task detail.
- User emphasis is correctness of dependencies, files, and parallel safety.
- Test infrastructure exists: Vitest + npm scripts (`npm test`, `npm run test:watch`, `npm run typecheck`, `npm run build`).
- CI/CD, coverage, linting, and formatting gates are currently absent.
- Current best-fit verification strategy is likely tests-after plus agent-executed QA, unless user prefers TDD for the wave.
- File-collision audit found the current 3-worktree Wave 1 is not truly conflict-free.
- Major hotspots: `src/renderer/PixiStage.tsx`, `src/simulation/tick.ts`, `src/App.tsx`, `src/simulation/entity.ts`, `src/simulation/components.ts`, `src/behaviors/registry.ts`, `src/simulation/world.ts`.
- False-parallel items identified:
  - `#92` must be last in renderer lane.
  - `#15` + `#18` must be coordinated together.
  - `#16` + `#17` must be coordinated together.
  - `#37` crosses UI and renderer.
  - New behavior items (`#55`, `#56`, `#57`, `#62`) must be sequenced because they all extend shared unions/registry.
- Safer structure is still a single Wave 1, but internally split into sub-lanes and merge-tail checkpoints rather than pretending the 3 lanes are fully independent.
- Metis review confirmed the plan needs explicit merge policy, explicit file-ownership guardrails, a no-scope-creep rule, a regression baseline (`npm test`, `npm run typecheck`, `npm run build`), and a single integration branch before anything lands on `main`.

## Open Questions
- No blocking questions remain.

## Scope Boundaries
- INCLUDE: critique of current Wave 1 plan, dependency review, file-collision analysis, replacement work plan.
- EXCLUDE: actual implementation, later-wave execution, spawning worktrees right now.

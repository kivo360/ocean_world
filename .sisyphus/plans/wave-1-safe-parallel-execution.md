# Wave 1 Safe Parallel Execution

## TL;DR

> **Quick Summary**: Replace the current high-level “3 big worktrees” idea with a safer execution shape: **4 isolated implementation worktrees + 1 integration worktree**, with all cross-lane items deferred to an explicit integration tail.
>
> **Deliverables**:
> - A corrected Wave 1 scope with `#94` removed
> - File-ownership guardrails per lane
> - A conflict-aware task graph for renderer, simulation, UI, and tooling work
> - A single integration branch for `#15`, `#37`, and `#46`
> - Concrete QA gates (`npm run typecheck`, `npm test`, `npm run build`, browser smoke)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 isolated lanes, then 1 integration tail
> **Critical Path**: Baseline + worktrees → renderer/simulation/UI/tooling lanes → integration tail (`#15`, `#37`, `#46`) → final verification

---

## Context

### Original Request
Critique the existing Wave 1 planning docs and replace them with a real execution plan that can be parallelized safely, with good dependencies, correct file ownership, and smooth downstream execution.

### Interview Summary
**Key decisions**:
- Scope target: the custom “remaining Wave 1” defined in `docs/plan-wave-1.md`
- Optimization priority: **safety over maximum concurrency**
- Test strategy: **tests after implementation**, with agent-executed QA as the primary gate
- Remove `#94` bundle-size budget CI from this wave

**Defaults applied**:
- `#17` is implemented as **visual-only easing in `src/renderer/PixiStage.tsx`**, not by changing gameplay velocity in `src/App.tsx`
- `#15`, `#37`, and `#46` are treated as **integration-tail items** because they require state/prop plumbing across lanes
- No implementation branch merges directly into `main`; all land in a dedicated integration branch first

### Critique of the Current Docs
The current docs are directionally useful but not yet execution-safe.

1. **`docs/plan-wave-1.md` overstates parallel safety**.
   - The big-picture renderer/simulation/UI split is good at the branch level.
   - It is **not** good enough at the task level because each lane still has a hotspot file:
     - Renderer: `src/renderer/PixiStage.tsx`
     - Simulation: `src/simulation/tick.ts`
     - UI: `src/App.tsx`
   - Without explicit internal sequencing, agents will fight their own hotspot files even if branches do not overlap.

2. **The current plan mixes isolated work with integration work**.
   - `#15` camera shake needs scenario-to-renderer plumbing.
   - `#37` hover-to-peek needs renderer hover-state plus UI overlay wiring.
   - `#46` in-range indicator needs interaction-target state plus renderer overlay.
   - These should not live in the initial parallel pass.

3. **The current plan merges UI and tooling unnecessarily**.
   - `#68` and `#90` do not need to share a branch with `src/App.tsx` edits.
   - Keeping them in a small tooling lane reduces App churn and improves verification clarity.

4. **The current plan has no explicit merge policy**.
   - Without a single integration checkpoint, the first completed worktree will create rebase pressure for all remaining branches.

5. **The current plan lacks hard guardrails**.
   - It does not define authorized files, forbidden files, regression gates, or how to handle cross-lane items.

### Research Findings
- Existing verification commands are available via `package.json:6-18`:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
- Vitest is configured in `vitest.config.ts:1-9`.
- Existing test patterns live in:
  - `tests/ecs.test.ts:1-51`
  - `tests/behaviors.test.ts:1-60`
  - `tests/tick.test.ts:1-113`
- Existing wave references:
  - `docs/plan-wave-1.md:243-269`
  - `.handoffs/2026-04-27-wave1-planning.md:34-65`

### Metis Review
The pre-plan review surfaced the following required corrections:
- Make merge strategy explicit: **all lane branches merge into one integration branch before `main`**
- Define authorized-file and do-not-touch lists per branch
- Lock down scope so agents do not “discover” extra polish or refactors mid-wave
- Add regression baselines before and after the wave
- Turn cross-lane items into a dedicated integration tail

---

## Work Objectives

### Core Objective
Execute the current remaining Wave 1 as a **single, safe, parallelizable delivery unit** by isolating file ownership, sequencing hotspot edits inside each lane, and reserving all cross-lane behavior for one integration checkpoint.

### Concrete Deliverables
- Renderer lane completes: `#2`, `#7`, `#12`, `#14`, `#17`, `#18`, `#21`, `#22`, `#23`, `#25`, `#92`
- Simulation lane completes: `#55`, `#56`, `#57`, `#59`, `#61`, `#62`, `#65`, `#66`, `#67`, `#71`, `#72`, `#73`, `#75`
- UI lane completes: `#9`, `#16`, `#36`, `#39`, `#43`, `#44`, `#45`, `#47`, `#49`, `#50`, `#52`
- Tooling lane completes: `#68`, `#90`
- Integration lane completes: `#8`, `#15`, `#24`, `#37`, `#46`, `#53`

### Definition of Done
- [ ] All scoped items above are implemented and verified
- [ ] `#94` is not included anywhere in this wave
- [ ] Each implementation lane edits only its authorized files
- [ ] All lane branches pass `npm run typecheck`, `npm test`, and `npm run build` before merge to integration
- [ ] Integration branch passes final browser smoke + final verification wave before merge to `main`

### Must Have
- One baseline step before code changes
- Four isolated implementation lanes
- One dedicated integration lane
- One explicit merge order
- Evidence-backed QA for every task

### Must NOT Have (Guardrails)
- No direct merges from lane branches to `main`
- No cross-lane file edits during isolated implementation
- No scope creep into `#42`, `#48`, `#63`, `#64`, `#69`, `#70`, `#94`, or later-wave items
- No refactors outside `#92`
- No UI branch edits to `src/renderer/PixiStage.tsx`
- No renderer branch edits to `src/App.tsx` or `src/simulation/`
- No simulation branch edits to `src/renderer/` or `src/ui/`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — verification is agent-executed. Screenshots, terminal captures, and JSON/text outputs are the evidence. No manual “looks good” checkpoints are allowed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: Vitest
- **Primary QA mode**: Agent-executed browser/API/CLI verification plus regression commands

### Baseline Commands
Run before any lane work starts and save outputs under `.sisyphus/evidence/baseline/`.

```bash
npm run typecheck
npm test
npm run build
```

### QA Policy
- **Renderer / UI / Integration tasks**: browser QA with screenshots and console-error checks
- **Simulation / Tooling tasks**: terminal QA with Vitest + typecheck/build outputs
- **Every lane branch** must pass:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
- **Integration branch** must additionally pass:
  - browser smoke against `npm run dev`
  - targeted interaction checks for the integrated features

### Evidence Locations
- Baseline: `.sisyphus/evidence/baseline/`
- Renderer: `.sisyphus/evidence/renderer/`
- Simulation: `.sisyphus/evidence/simulation/`
- UI: `.sisyphus/evidence/ui/`
- Tooling: `.sisyphus/evidence/tooling/`
- Integration: `.sisyphus/evidence/integration/`
- Final QA: `.sisyphus/evidence/final-qa/`

---

## Execution Strategy

### Worktree Topology

Create these branches/worktrees from a clean `main` before implementation starts:

```bash
git worktree add "../ocean-world-wave1-renderer" -b wave1-renderer
git worktree add "../ocean-world-wave1-simulation" -b wave1-simulation
git worktree add "../ocean-world-wave1-ui" -b wave1-ui
git worktree add "../ocean-world-wave1-tooling" -b wave1-tooling
git worktree add "../ocean-world-wave1-integration" -b wave1-integration
```

### Merge Policy
1. All isolated lanes work only in their own branches.
2. No lane branch merges into `main`.
3. Once a lane passes its QA gate, it waits.
4. The integration worktree merges completed lane branches in this order:
   1. `wave1-tooling`
   2. `wave1-simulation`
   3. `wave1-ui`
   4. `wave1-renderer`
5. Integration-tail items (`#15`, `#37`, `#46`) are implemented **only after** those merges succeed.
6. Only the integration branch is allowed to merge into `main`.

### Parallel Execution Waves

```text
Wave 0 — Preflight (sequential)
└── T1 Baseline + worktree setup

Wave 1 — Isolated implementation lanes (parallel)
├── Renderer chain: T2 → T3 → T4
├── Simulation chain: T5 → T6 → T7 → T8 → T9
├── UI chain: T10 → T11 → T12
└── Tooling chain: T13 → T14

Wave 2 — Integration tail (sequential on integration branch)
└── T15 → T16 → T17

Wave FINAL — Parallel verification
├── F1 Plan compliance audit
├── F2 Code quality + regression review
├── F3 Real browser/terminal QA
└── F4 Scope fidelity audit
```

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| T1 | None | T2, T5, T10, T13 |
| T2 | T1 | T3, T4 |
| T3 | T2 | T4 |
| T4 | T3 | T15, T16, T17 |
| T5 | T1 | T6 |
| T6 | T5 | T7 |
| T7 | T6 | T8, F1-F4 |
| T8 | T7 | T9, F1-F4 |
| T9 | T8 | F1-F4 |
| T10 | T1 | T11, T16, T17 |
| T11 | T10 | T16, T17 |
| T12 | T10 | F1-F4 |
| T13 | T1 | T14 |
| T14 | T13 | F1-F4 |
| T15 | T4, T10, T11 | T16, T17, F1-F4 |
| T16 | T4, T10, T11, T15 | F1-F4 |
| T17 | T4, T10, T11, T15 | F1-F4 |

### Authorized File Ownership

**Renderer branch**
- Allowed:
  - `src/renderer/PixiStage.tsx`
- Forbidden:
  - `src/App.tsx`
  - `src/ui/**`
  - `src/simulation/**`
  - `tests/**`

**Simulation branch**
- Allowed:
  - `src/behaviors/*.ts`
  - `src/behaviors/registry.ts`
  - `src/simulation/archetypes.ts`
  - `src/simulation/components.ts`
  - `src/simulation/entity.ts`
  - `src/simulation/tick.ts`
  - `src/simulation/world.ts`
  - `tests/tick.test.ts`, `tests/behaviors.test.ts`, `tests/ecs.test.ts`
  - new simulation-specific test files created under `tests/`
- Forbidden:
  - `src/renderer/**`
  - `src/App.tsx`
  - `src/ui/**`

**UI branch**
- Allowed:
  - `src/App.tsx`
  - `src/simulation/player-actions.ts`
  - `src/ui/Controls.tsx`
  - `src/ui/Inspector.tsx`
  - new UI-only components under `src/ui/**`
- Forbidden:
  - `src/renderer/PixiStage.tsx`
  - `src/simulation/tick.ts`
  - `src/behaviors/**`

**Tooling branch**
- Allowed:
  - new test files under `tests/` (prefix `ab-runner-*`, `sprite-atlas-*`, or `ab-*`)
  - tool-only files or scripts created for `#68`
  - `src/renderer/sprite-atlas.ts` (allowed unconditionally for `#90`; add needed exports here)
- Forbidden:
  - `src/App.tsx`
  - `src/renderer/PixiStage.tsx`
  - `src/simulation/**`

**Integration branch**
- Allowed:
  - `src/App.tsx`
  - `src/renderer/PixiStage.tsx`
  - small new UI component(s) for hover-peek if required
- Forbidden:
  - new simulation behavior work
  - new tooling work

---

## TODOs

- [ ] T1. Preflight baseline + worktree provisioning

  **What to do**:
  - Capture the pre-wave regression baseline from clean `main`.
  - Create the five branches/worktrees defined in the topology section.
  - Record a one-file ownership manifest per branch so executors cannot “helpfully” cross lanes.

  **Must NOT do**:
  - Do not implement any roadmap item in this step.
  - Do not create feature branches from anything except clean `main`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: procedural setup, evidence capture, and branch provisioning.
  - **Skills**: [`verification-loop`, `git-workflow`]
    - `verification-loop`: enforce baseline evidence before implementation starts.
    - `git-workflow`: keep branch/worktree setup disciplined.
  - **Skills Evaluated but Omitted**:
    - `playwright-best-practices`: not needed until browser verification begins.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential preflight
  - **Blocks**: T2, T5, T11, T15
  - **Blocked By**: None

  **References**:
  - `package.json:6-18` - canonical verification commands available in this repo.
  - `README.md:7-24` - local boot assumptions and the expected dev URL/controls.
  - `docs/plan-wave-1.md:243-269` - prior wave split to critique and replace during setup notes.
  - `.handoffs/2026-04-27-wave1-planning.md:34-65` - previously identified hotspots and exclusions.

  **Acceptance Criteria**:
  - [ ] Baseline outputs for `npm run typecheck`, `npm test`, and `npm run build` are saved.
  - [ ] Baseline commit SHA saved to `.sisyphus/evidence/baseline/commit-sha.txt`.
  - [ ] A browser smoke screenshot of the current app is saved.
  - [ ] Five worktrees exist with the exact branch names in this plan.
  - [ ] No source files are modified in this step.

  **QA Scenarios**:

  ```text
  Scenario: Baseline command suite succeeds
    Tool: Bash
    Preconditions: Clean main branch, dependencies installed
    Steps:
      1. Run `npm run typecheck` and save stdout/stderr to `.sisyphus/evidence/baseline/typecheck.txt`
      2. Run `npm test` and save stdout/stderr to `.sisyphus/evidence/baseline/test.txt`
      3. Run `npm run build` and save stdout/stderr to `.sisyphus/evidence/baseline/build.txt`
    Expected Result: All three commands exit 0
    Failure Indicators: Any non-zero exit code or missing evidence file
    Evidence: `.sisyphus/evidence/baseline/*.txt`

  Scenario: Browser smoke baseline
    Tool: Playwright
    Preconditions: `npm run dev` serving `http://localhost:5173`
    Steps:
      1. Open `http://localhost:5173`
      2. Wait for selector `canvas`
      3. Assert header text `Ocean World` is visible
      4. Save screenshot of the full app shell
    Expected Result: Stage canvas renders and the app shell loads without blocking errors
    Failure Indicators: Missing canvas, blank stage, startup exception, or fatal overlay error
    Evidence: `.sisyphus/evidence/baseline/app-shell.png`
  ```

  **Commit**: NO

- [ ] T2. Renderer entity presentation pass (`#2`, `#12`, `#14`, `#21`, `#23`)

  **What to do**:
  - In `src/renderer/PixiStage.tsx`, add low-risk per-entity polish only:
    - idle bob
    - selection ring glow/pulse
    - energy bar gradient
    - animation-phase reset on direction change
    - visual boundary nudge for bump feedback
  - Keep all work inside the existing RAF entity update path.

  **Must NOT do**:
  - Do not change camera behavior.
  - Do not touch `src/App.tsx`, `src/simulation/**`, or extract `renderEntity()` yet.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: pixel-art presentation changes inside one render loop.
  - **Skills**: [`playwright-best-practices`]
    - `playwright-best-practices`: browser-driven verification for canvas changes.
  - **Skills Evaluated but Omitted**:
    - `e2e-testing`: not needed; this is feature QA, not suite architecture.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T5, T11, T15
  - **Blocks**: T3, T4, T16, T17
  - **Blocked By**: T1

  **References**:
  - `src/renderer/PixiStage.tsx:230-363` - per-entity RAF update loop; this is the insertion point for all five items.
  - `src/renderer/PixiStage.tsx:157-159,373-384` - current selection ring lifecycle for adding glow/pulse.
  - `src/renderer/PixiStage.tsx:299-320` - sprite animation state path; use it for phase reset logic.
  - `src/renderer/PixiStage.tsx:329-332` - current energy bar drawing to replace with gradient fill logic.
  - `src/simulation/tick.ts:307-325` - existing world-bound clamp; mirror this only as visual feedback, not new movement rules.

  **Acceptance Criteria**:
  - [ ] Only `src/renderer/PixiStage.tsx` changes in this task.
  - [ ] Selected entities show an animated ring, not a static stroke.
  - [ ] Low-energy entities render with a warm/red bar instead of solid green.
  - [ ] Direction changes visibly reset animation phase instead of carrying old cadence.
  - [ ] Boundary collisions show a brief visual nudge without changing simulation rules.

  **QA Scenarios**:

  ```text
  Scenario: Idle bob + ring pulse + energy gradient are visible together
    Tool: Playwright
    Preconditions: Renderer branch running via `npm run dev`
    Steps:
      1. Open `http://localhost:5173` and wait for `canvas`
      2. In page context, move one non-player entity near the player and set its energy to `0.15` using `window.__OCEAN__.world`
      3. Click the sprite positioned ~60px to the right of center on the canvas
      4. Capture two screenshots 500ms apart
    Expected Result: The selected entity shows a glowing/pulsing ring, low-energy bar is red/orange, and the sprite shifts vertically between screenshots
    Failure Indicators: Static ring, always-green low-energy bar, or no visible bob delta across screenshots
    Evidence: `.sisyphus/evidence/renderer/task-t2-selection-a.png`, `.sisyphus/evidence/renderer/task-t2-selection-b.png`

  Scenario: Boundary bump feedback does not crash the renderer
    Tool: Playwright
    Preconditions: Same app session
    Steps:
      1. Hold `ArrowLeft` for 3s, then `ArrowUp` for 3s to force the player into world bounds
      2. Watch browser console during movement
      3. Capture screenshot of the player at the edge
    Expected Result: The player stays clamped in-bounds, the renderer remains stable, and no runtime error appears
    Failure Indicators: Player disappears, renderer stalls, or console throws during edge movement
    Evidence: `.sisyphus/evidence/renderer/task-t2-boundary.png`
  ```

  **Commit**: YES
  - Message: `feat(renderer): add baseline entity presentation cues`
  - Files: `src/renderer/PixiStage.tsx`
  - Pre-commit: `npm run typecheck`

- [ ] T3. Renderer motion + animation pass (`#7`, `#17`, `#22`, `#25`)

  **What to do**:
  - Extend `src/renderer/PixiStage.tsx` with:
    - footstep dust on walking cadence
    - visual-only acceleration easing for player rendering
    - idle fidget behavior when sprites stay idle long enough
    - stop-animation interpolation back toward frame 0
  - Keep player physics untouched in `src/App.tsx`; this task is render-only.

  **Must NOT do**:
  - Do not modify `src/App.tsx` movement math.
  - Do not add scenario-based particles or tint flashes yet.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: animation timing and per-frame sprite feel.
  - **Skills**: [`playwright-best-practices`]
    - `playwright-best-practices`: verify motion, waiting, and screenshots at fixed times.
  - **Skills Evaluated but Omitted**:
    - `vitest`: these are visual timing behaviors, not good unit-test-first targets.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Renderer sub-lane after T2
  - **Blocks**: T4, T16, T17
  - **Blocked By**: T2

  **References**:
  - `src/renderer/PixiStage.tsx:299-320` - animation state and frame-advance logic; extend this instead of inventing a second animation system.
  - `src/renderer/PixiStage.tsx:293-320` - current position+sprite update order; keep easing and particles inside this order.
  - `src/App.tsx:290-329` - player position source; confirms this task must remain visual-only.
  - `src/renderer/sprite-atlas.ts:93-104` - current animation naming scheme; idle/walk rows must stay compatible.

  **Acceptance Criteria**:
  - [ ] Player movement feels eased visually without changing world coordinates logic in `src/App.tsx`.
  - [ ] Walking sprites emit footstep dust tied to walking cadence.
  - [ ] Idle sprites show a visible fidget after sustained idle time.
  - [ ] Stopping movement eases into idle instead of freezing mid-stride.

  **QA Scenarios**:

  ```text
  Scenario: Walking produces easing + dust
    Tool: Playwright
    Preconditions: Renderer branch dev server is running
    Steps:
      1. Open `http://localhost:5173` and focus the page
      2. Hold `ArrowRight` for 1500ms, then release
      3. Capture one screenshot during movement and one 300ms after release
      4. Record browser console output during the run
    Expected Result: During movement the player trail feels eased and dust is visible near feet; after release the sprite settles back instead of freezing
    Failure Indicators: Immediate stop-frame freeze, no dust despite movement, or runtime errors
    Evidence: `.sisyphus/evidence/renderer/task-t3-walk.png`, `.sisyphus/evidence/renderer/task-t3-stop.png`, `.sisyphus/evidence/renderer/task-t3-console.txt`

  Scenario: Idle fidget appears without input
    Tool: Playwright
    Preconditions: Same app session, player stationary
    Steps:
      1. Release all movement keys
      2. Wait 9 seconds
      3. Capture screenshot of a nearby idle sprite
    Expected Result: At least one idle sprite leaves the static idle pose during the wait window
    Failure Indicators: All sprites remain perfectly static for the full idle window
    Evidence: `.sisyphus/evidence/renderer/task-t3-idle-fidget.png`
  ```

  **Commit**: YES
  - Message: `feat(renderer): improve motion cadence and idle animation`
  - Files: `src/renderer/PixiStage.tsx`
  - Pre-commit: `npm run typecheck`

- [ ] T4. Renderer camera tail + `renderEntity()` extraction (`#18`, `#92`)

  **What to do**:
  - Add camera lookahead to the existing camera dead-zone logic.
  - After all prior renderer work is stable, extract a dedicated `renderEntity()` helper from the monolithic RAF loop.
  - End the renderer lane with its full branch QA gate.

  **Must NOT do**:
  - Do not implement camera shake here; that is reserved for integration.
  - Do not move feature logic out of `PixiStage.tsx` into unrelated files just to “clean things up.”

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: camera feel plus one contained renderer refactor.
  - **Skills**: [`verification-loop`, `playwright-best-practices`]
    - `verification-loop`: enforce the renderer branch gate before merge.
    - `playwright-best-practices`: verify lookahead behavior in-browser.
  - **Skills Evaluated but Omitted**:
    - `refactor-clean`: too broad; this refactor must stay narrowly scoped to `#92`.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Renderer sub-lane tail
  - **Blocks**: T16, T17
  - **Blocked By**: T3

  **References**:
  - `src/renderer/PixiStage.tsx:174-228` - current camera dead-zone + lerp logic; add lookahead here before refactoring.
  - `src/renderer/PixiStage.tsx:230-363` - entity render body to extract into `renderEntity()` only after previous behavior is stable.
  - `docs/plan-wave-1.md:247-249,275-277` - prior intent that `#92` should land last in the renderer worktree.
  - `package.json:7-12` - lane gate commands available after refactor.

  **Acceptance Criteria**:
  - [ ] Camera leads slightly in the direction of travel while preserving dead-zone behavior.
  - [ ] A dedicated `renderEntity()` helper exists and is the only scoped refactor in the lane.
  - [ ] Renderer branch passes `npm run typecheck`, `npm test`, and `npm run build`.
  - [ ] No files outside `src/renderer/PixiStage.tsx` change in this task.

  **QA Scenarios**:

  ```text
  Scenario: Camera lookahead works without breaking dead-zone behavior
    Tool: Playwright
    Preconditions: Renderer branch dev server is running
    Steps:
      1. Open the app and wait for `canvas`
      2. Hold `ArrowRight` for 2 seconds, then `ArrowLeft` for 2 seconds
      3. Capture screenshots during each movement phase
    Expected Result: The camera sits slightly ahead in movement direction and recenters smoothly on reversal, without sudden jumps
    Failure Indicators: Camera overshoots wildly, ignores dead zone, or jitters on reversal
    Evidence: `.sisyphus/evidence/renderer/task-t4-lookahead-right.png`, `.sisyphus/evidence/renderer/task-t4-lookahead-left.png`

  Scenario: Renderer branch gate passes
    Tool: Bash
    Preconditions: All renderer-lane commits applied
    Steps:
      1. Run `npm run typecheck`
      2. Run `npm test`
      3. Run `npm run build`
      4. Save outputs to renderer evidence directory
    Expected Result: All commands exit 0
    Failure Indicators: Any command fails or the refactor introduces a regression
    Evidence: `.sisyphus/evidence/renderer/task-t4-typecheck.txt`, `.sisyphus/evidence/renderer/task-t4-test.txt`, `.sisyphus/evidence/renderer/task-t4-build.txt`
  ```

  **Commit**: YES
  - Message: `refactor(renderer): extract entity render path after lookahead`
  - Files: `src/renderer/PixiStage.tsx`
  - Pre-commit: `npm run typecheck && npm test && npm run build`

- [ ] T5. Simulation foundation pass (`#59`, `#65`, `#66`, `#75`)

  **What to do**:
  - Add the lowest-coupling simulation changes first:
    - memory recency weighting
    - long-term saving toward goals
    - T3 regional budget/backpressure
    - behavior cooldowns
  - Keep these as additive changes to existing simulation data and tick evaluation.

  **Must NOT do**:
  - Do not add new behavior modules yet.
  - Do not implement lifecycle/metabolism yet.
  - Do not change renderer/UI files for visualization of these systems.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: multi-file simulation logic with cross-cutting tick consequences.
  - **Skills**: [`vitest`, `verification-loop`]
    - `vitest`: existing simulation test style should be extended carefully.
    - `verification-loop`: force regression gates around shared tick logic.
  - **Skills Evaluated but Omitted**:
    - `playwright-best-practices`: this lane is primarily headless logic.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T2, T11, T15
  - **Blocks**: T6, T7, T8, T9
  - **Blocked By**: T1

  **References**:
  - `src/simulation/tick.ts:117-155` - behavior evaluation path; cooldowns and memory weighting feed into this flow.
  - `src/simulation/tick.ts:157-230` - decide phase, including T3 queueing and regional logic; T3 budget belongs here.
  - `src/simulation/components.ts:13-61` - current component surface; extend data here for savings/cooldowns only as needed.
  - `tests/tick.test.ts:12-112` - baseline determinism and tick-loop behavior expectations that must remain green.
  - `tests/behaviors.test.ts:12-59` - current behavior score unit-test style.

  **Acceptance Criteria**:
  - [ ] Existing tick tests still pass.
  - [ ] T3 queueing respects a regional budget/backpressure rule.
  - [ ] Behavior evaluation supports cooldowns without removing current behaviors.
  - [ ] Long-term saving state exists and updates without breaking entity spawn/state shape.

  **QA Scenarios**:

  ```text
  Scenario: Simulation foundation regression suite passes
    Tool: Bash
    Preconditions: Simulation branch dependencies installed
    Steps:
      1. Run `npm test -- tests/tick.test.ts tests/behaviors.test.ts tests/ecs.test.ts`
      2. Save output to simulation evidence directory
    Expected Result: Targeted simulation regression suite passes
    Failure Indicators: Determinism, behavior score, or ECS baseline tests fail
    Evidence: `.sisyphus/evidence/simulation/task-t5-regression.txt`

  Scenario: Full branch validation passes after foundation changes
    Tool: Bash
    Preconditions: Same branch after implementation
    Steps:
      1. Run `npm run typecheck`
      2. Run `npm test`
      3. Run `npm run build`
    Expected Result: All three commands exit 0
    Failure Indicators: Type drift in entity/component additions or tick regressions
    Evidence: `.sisyphus/evidence/simulation/task-t5-typecheck.txt`, `.sisyphus/evidence/simulation/task-t5-test.txt`, `.sisyphus/evidence/simulation/task-t5-build.txt`
  ```

  **Commit**: YES
  - Message: `feat(simulation): add budgeting cooldown and savings foundations`
  - Files: `src/simulation/tick.ts`, `src/simulation/components.ts`, related tests
  - Pre-commit: `npm run typecheck && npm test`

- [ ] T6. Simulation behavior module pass (`#55`, `#56`, `#57`, `#61`, `#62`)

  **What to do**:
  - Add new simulation behaviors and their supporting value/mood state:
    - group up at low energy
    - avoid lawkeepers for fairness-low NPCs
    - pursue violators for lawkeepers
    - mood modifiers
    - merchant cohort coordination
  - Follow the existing `wander.ts` behavior-module pattern.
  - Wire every new behavior through the full registration path.

  **Must NOT do**:
  - Do not create a new behavior system abstraction.
  - Do not skip the 4-location registration checklist.
  - Do not implement defection thresholds or crowd contagion in this wave.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: this is the highest-risk shared-logic portion of the sim lane.
  - **Skills**: [`vitest`, `verification-loop`]
    - `vitest`: validate new behavior scoring/decide paths with focused tests.
    - `verification-loop`: protect against type-regression in shared unions and registry.
  - **Skills Evaluated but Omitted**:
    - `python-testing`: irrelevant to this TS/Vitest codebase.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Simulation sub-lane after T5
  - **Blocks**: T7, T8, T9
  - **Blocked By**: T5

  **References**:
  - `src/behaviors/wander.ts:1-42` - canonical `BehaviorModule` implementation pattern.
  - `src/behaviors/behavior.ts:1-13` - behavior module contract that all new modules must satisfy.
  - `src/behaviors/registry.ts:1-16` - registry wiring pattern.
  - `src/simulation/entity.ts:11-32` - `BehaviorName`, `state`, and `activeBehavior` type surface to extend.
  - `src/simulation/archetypes.ts:17-117,147-185` - archetype behavior arrays and state object shape that must include new behaviors.
  - `src/simulation/tick.ts:82-105,117-155` - locked phases and `valueWeight()` path to update for new behaviors.
  - `tests/behaviors.test.ts:12-59` - focused behavior scoring test style.

  **Acceptance Criteria**:
  - [ ] Every new behavior is wired in all required locations: `entity.ts`, `archetypes.ts`, `registry.ts`, and `tick.ts`.
  - [ ] No TypeScript exhaustiveness errors remain for `BehaviorName` or `state` maps.
  - [ ] New behavior tests exist for at least one score/decision path per behavior family.
  - [ ] Existing behavior tests still pass.

  **QA Scenarios**:

  ```text
  Scenario: New behavior wiring compiles cleanly
    Tool: Bash
    Preconditions: T6 implementation complete
    Steps:
      1. Run `npm run typecheck`
      2. Grep the output file for `BehaviorName`, `state`, or `REGISTRY` errors
    Expected Result: No type errors related to behavior registration/wiring
    Failure Indicators: Missing union members, missing state keys, or registry type failures
    Evidence: `.sisyphus/evidence/simulation/task-t6-typecheck.txt`

  Scenario: Behavior-focused tests pass
    Tool: Bash
    Preconditions: Focused tests added/updated
    Steps:
      1. Run `npm test -- tests/behaviors.test.ts tests/tick.test.ts`
      2. Save output
    Expected Result: Behavior score and tick behavior tests pass with new behaviors present
    Failure Indicators: Any regression in score selection or runtime flow
    Evidence: `.sisyphus/evidence/simulation/task-t6-tests.txt`
  ```

  **Commit**: YES
  - Message: `feat(simulation): add wave-1 social behavior modules`
  - Files: `src/behaviors/*.ts`, `src/behaviors/registry.ts`, `src/simulation/entity.ts`, `src/simulation/archetypes.ts`, `src/simulation/tick.ts`, tests
  - Pre-commit: `npm run typecheck && npm test`

- [ ] T7. Simulation replay pass (`#67`)

  **What to do**:
  - Add a replay system that captures enough seed/scenario/tick context to support deterministic reruns.
  - Keep the initial scope narrow: recording and replay hooks sufficient for A/B and regression work, not a full playback UI.

  **Must NOT do**:
  - Do not build replay visualization UI.
  - Do not redesign the world event system.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: determinism-sensitive infrastructure.
  - **Skills**: [`vitest`]
    - `vitest`: replayability is best checked with targeted deterministic tests.
  - **Skills Evaluated but Omitted**:
    - `playwright-best-practices`: not the right verification modality here.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Simulation lane after T6, must run before T8
  - **Blocks**: T8, F1-F4
  - **Blocked By**: T6

  **References**:
  - `src/simulation/tick.ts:487-516` - public tick driver where replay hooks must stay deterministic.
  - `src/scenarios/small-village.ts:37-67` - world seed/bootstrap path to capture.
  - `tests/tick.test.ts:23-37` - current determinism expectation for same-seed runs.
  - `docs/plan-wave-1.md:74-79,107-110` - original intent for replay/A-B/tooling support.

  **Acceptance Criteria**:
  - [ ] Replay capture stores enough metadata to re-run the same deterministic path.
  - [ ] Existing determinism test remains green.
  - [ ] A replay-specific test or script proves same-seed same-event equivalence.

  **QA Scenarios**:

  ```text
  Scenario: Replay determinism stays stable
    Tool: Bash
    Preconditions: Replay implementation complete
    Steps:
      1. Run the replay-focused test or script twice with the same seed/scenario inputs
      2. Compare outputs byte-for-byte or JSON-for-JSON
    Expected Result: Outputs match exactly
    Failure Indicators: Divergent state snapshots or event streams across identical reruns
    Evidence: `.sisyphus/evidence/simulation/task-t7-replay.txt`

  Scenario: Full test suite still passes after replay hooks
    Tool: Bash
    Preconditions: Same branch after T7
    Steps:
      1. Run `npm test`
      2. Save output
    Expected Result: No determinism regressions introduced
    Failure Indicators: Tick loop or orchestration regressions after replay instrumentation
    Evidence: `.sisyphus/evidence/simulation/task-t7-tests.txt`
  ```

  **Commit**: YES
  - Message: `feat(simulation): add deterministic replay capture`
  - Files: replay-related files plus minimal simulation hooks/tests
  - Pre-commit: `npm run typecheck && npm test`

- [ ] T8. Simulation population/lifecycle pass (`#71`, `#72`, `#73`)

  **What to do**:
  - Add density auto-tuning, death/birth lifecycle events, and full metabolism.
  - Keep the changes additive and compatible with current region gating.
  - Ensure graph cleanup hooks happen when entities are removed.

  **Must NOT do**:
  - Do not add new UI for lifecycle or metabolism in this task.
  - Do not change unrelated behavior selection rules unless required by metabolism.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: world-entity lifecycle changes are shared-state heavy and high-risk.
  - **Skills**: [`vitest`, `verification-loop`]
    - `vitest`: regression tests are needed because lifecycle changes can silently destabilize the sim.
    - `verification-loop`: keep build/test gates tight around shared world state.
  - **Skills Evaluated but Omitted**:
    - `database-migrations`: graph cleanup is in-memory/Surreal app logic, not DB schema work.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Simulation lane after T7
  - **Blocks**: T9, F1-F4
  - **Blocked By**: T7

  **References**:
  - `src/simulation/world.ts:27-53,94-103,179-203` - world entity storage, emit path, and state helpers relevant to lifecycle work.
  - `src/simulation/tick.ts:462-479` - passive decay/metabolism insertion point.
  - `src/simulation/tick.ts:487-516` - overall tick sequencing to preserve.
  - `src/simulation/graph-memory.ts:34-41,195-211` - current graph pruning semantics to respect when removing stale entities.
  - `src/simulation/surreal-graph-memory.ts:168-191` - durable memory prune behavior to keep consistent.

  **Acceptance Criteria**:
  - [ ] World population can grow/shrink without corrupting `world.entities` or `world.order`.
  - [ ] Metabolism extends passive decay instead of bypassing it.
  - [ ] Entity removal cleans up related state without leaving broken references.
  - [ ] Full lane gate still passes after lifecycle additions.

  **QA Scenarios**:

  ```text
  Scenario: Lifecycle/metabolism branch gate passes
    Tool: Bash
    Preconditions: T8 implementation complete
    Steps:
      1. Run `npm run typecheck`
      2. Run `npm test`
      3. Run `npm run build`
    Expected Result: Shared-state changes compile and all tests remain green
    Failure Indicators: Entity-order corruption, type errors, or build breakage
    Evidence: `.sisyphus/evidence/simulation/task-t8-typecheck.txt`, `.sisyphus/evidence/simulation/task-t8-test.txt`, `.sisyphus/evidence/simulation/task-t8-build.txt`

  Scenario: Long-running sim does not crash after lifecycle changes
    Tool: Bash
    Preconditions: A deterministic smoke script or test harness is available on this branch
    Steps:
      1. Run a fixed-seed simulation for 300 ticks
      2. Save summary output (entity count, event count, error state)
    Expected Result: Simulation completes without throwing and retains coherent entity counts
    Failure Indicators: Unhandled exception, negative/NaN state, or broken entity registry
    Evidence: `.sisyphus/evidence/simulation/task-t8-300ticks.txt`
  ```

  **Commit**: YES
  - Message: `feat(simulation): add lifecycle and metabolism systems`
  - Files: `src/simulation/tick.ts`, `src/simulation/world.ts`, `src/simulation/components.ts`, related tests
  - Pre-commit: `npm run typecheck && npm test && npm run build`

- [ ] T9. Simulation lane final regression gate

  **What to do**:
  - Run the full lane-level verification suite after T5-T8.
  - Produce a short lane handoff note summarizing changed files, added behaviors, and any integration expectations.

  **Must NOT do**:
  - Do not start integration-tail work here.
  - Do not modify UI/renderer files to “show” the new simulation changes.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: this is a verification/handoff checkpoint, not new feature work.
  - **Skills**: [`verification-loop`, `git-workflow`]
    - `verification-loop`: ensure evidence is complete.
    - `git-workflow`: keep the branch ready for integration merge.
  - **Skills Evaluated but Omitted**:
    - `playwright-best-practices`: not needed for a headless lane gate.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Simulation lane tail
  - **Blocks**: F1-F4
  - **Blocked By**: T6, T7, T8

  **References**:
  - `package.json:6-18` - authoritative lane gate commands.
  - `tests/tick.test.ts:12-112` - regression-critical sim behaviors.
  - `.handoffs/2026-04-27-wave1-planning.md:46-65` - prior summary of shared sim hotspots.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck`, `npm test`, and `npm run build` all pass on the simulation branch.
  - [ ] Evidence files exist for each command.
  - [ ] Lane handoff note documents changed files and any integration assumptions.

  **QA Scenarios**:

  ```text
  Scenario: Simulation branch is merge-ready
    Tool: Bash
    Preconditions: All simulation commits complete
    Steps:
      1. Run `npm run typecheck`
      2. Run `npm test`
      3. Run `npm run build`
      4. Save a `git diff --stat main...HEAD` capture
    Expected Result: Commands pass and diff is limited to authorized simulation files/tests
    Failure Indicators: Any command failure or unauthorized file edits
    Evidence: `.sisyphus/evidence/simulation/task-t9-typecheck.txt`, `.sisyphus/evidence/simulation/task-t9-test.txt`, `.sisyphus/evidence/simulation/task-t9-build.txt`, `.sisyphus/evidence/simulation/task-t9-diffstat.txt`
  ```

  **Commit**: NO

- [ ] T10. UI controls and HUD pass (`#9`, `#16`, `#39`, `#44`, `#45`, `#47`, `#52`)

  **What to do**:
  - Implement UI-only or UI-dominant features first:
    - day/night HUD-facing state display strategy for `#9`
    - shift-to-run input + hint text
    - world-time HUD
    - region label presentation coordination on the app shell side
    - filterable archetype legend
    - whistle/shout broadcast input
    - free-text player speech input
  - Keep this task in `App.tsx`, `Controls.tsx`, and UI-only components.

  **Must NOT do**:
  - Do not touch `src/renderer/PixiStage.tsx`.
  - Do not implement hover-to-peek or in-range glow here.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI interaction and HUD composition in React.
  - **Skills**: [`playwright-best-practices`]
    - `playwright-best-practices`: ideal for keyboard/input/HUD QA.
  - **Skills Evaluated but Omitted**:
    - `shadcn`: no component-library migration is needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T2, T5, T15
  - **Blocks**: T11, T12, T16, T17
  - **Blocked By**: T1

  **References**:
  - `src/App.tsx:201-329` - tick driver, input handlers, and player movement hooks.
  - `src/App.tsx:471-639` - header, controls, stage wrapper, and overlay layout.
  - `src/ui/Controls.tsx:26-90` - current speed/t3 controls surface to extend.
  - `src/simulation/player-actions.ts:23-63` - current interaction and speech helpers.
  - `src/ui/InteractionMenu.tsx:11-90` - existing absolute-position interaction overlay style to imitate for free-text input affordances if needed.

  **Acceptance Criteria**:
  - [ ] `Shift` modifies player movement speed via UI/input-side logic.
  - [ ] The UI shows world-time/day context and region label context.
  - [ ] Whistle/shout and free-text speech entry are usable from the app shell.
  - [ ] No renderer or simulation hotspot files change.

  **QA Scenarios**:

  ```text
  Scenario: Shift-run and HUD updates work
    Tool: Playwright
    Preconditions: UI branch dev server is running
    Steps:
      1. Open the app and wait for `canvas`
      2. Hold `ArrowRight` for 1s, then reset state and hold `Shift+ArrowRight` for 1s
      3. Compare the player displacement in the two runs
      4. Assert world-time/day text is visible in the app shell
    Expected Result: Shift movement covers more distance and HUD time text is visible
    Failure Indicators: No measurable speed increase or missing HUD state
    Evidence: `.sisyphus/evidence/ui/task-t10-run-normal.png`, `.sisyphus/evidence/ui/task-t10-run-shift.png`

  Scenario: Broadcast + free-text speech input are usable
    Tool: Playwright
    Preconditions: Same session
    Steps:
      1. Trigger the whistle/shout control
      2. Enter a free-text message in the player speech input and submit
      3. Assert the app remains interactive and no error banner appears
    Expected Result: The controls submit successfully and the app shell stays stable
    Failure Indicators: Input never submits, keyboard focus traps, or runtime errors
    Evidence: `.sisyphus/evidence/ui/task-t10-speech.png`
  ```

  **Commit**: YES
  - Message: `feat(ui): expand controls and world hud interactions`
  - Files: `src/App.tsx`, `src/ui/Controls.tsx`, new UI-only components, `src/simulation/player-actions.ts`
  - Pre-commit: `npm run typecheck`

- [ ] T11. UI inventory and inspector pass (`#36`, `#43`, `#49`, `#50`)

  **What to do**:
  - Add inspector portrait support.
  - Add player inventory presentation.
  - Add gift-item and pin-memory UI/actions using existing player-action and graph-memory pathways.

  **Must NOT do**:
  - Do not redesign the entire inspector.
  - Do not implement hover-to-peek here.
  - Do not add new simulation behaviors for gifts or memory semantics.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: mixed UI presentation + thin action wiring.
  - **Skills**: [`playwright-best-practices`]
    - `playwright-best-practices`: verify panels and interaction flows.
  - **Skills Evaluated but Omitted**:
    - `react-email`: unrelated to in-app React UI.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: UI sub-lane after T10
  - **Blocks**: T12, T16, T17
  - **Blocked By**: T10

  **References**:
  - `src/ui/Inspector.tsx:48-197` - current inspector structure and entity detail sections.
  - `src/renderer/sprite-atlas.ts:38-90` - atlas frame access path for inspector portrait extraction.
  - `src/App.tsx:420-430,688-716` - current player wallet and inspector mounting points.
  - `src/simulation/player-actions.ts:46-140` - existing player action helpers and graph event write behavior.
  - `src/simulation/graph-memory.ts:34-41,123-185` - search/recent retrieval contract relevant to pin-memory UX.

  **Acceptance Criteria**:
  - [ ] Inspector can show a portrait for the selected entity.
  - [ ] Player inventory panel is visible and updates from game state.
  - [ ] Gift and pin-memory actions work through existing world/graph pathways.
  - [ ] No renderer hotspot files change.

  **QA Scenarios**:

  ```text
  Scenario: Inspector portrait and inventory panel render correctly
    Tool: Playwright
    Preconditions: UI branch dev server is running
    Steps:
      1. Open the app, click an entity, and switch to the inspector tab if needed
      2. Assert portrait content is visible inside the inspector panel
      3. Assert the player inventory panel is visible in the shell
    Expected Result: Both portrait and inventory UI render without layout breakage
    Failure Indicators: Blank portrait slot, missing inventory panel, or overlapping UI
    Evidence: `.sisyphus/evidence/ui/task-t11-inspector.png`, `.sisyphus/evidence/ui/task-t11-inventory.png`

  Scenario: Gift and pin-memory actions do not crash state updates
    Tool: Playwright
    Preconditions: Same session with a selected/nearby NPC
    Steps:
      1. Trigger the gift-item UI action
      2. Trigger the pin-memory UI action
      3. Observe the app for 2 seconds and collect browser console output
    Expected Result: Actions complete without runtime errors and UI remains responsive
    Failure Indicators: React crash, console exception, or permanently stuck UI state
    Evidence: `.sisyphus/evidence/ui/task-t11-actions.png`, `.sisyphus/evidence/ui/task-t11-console.txt`
  ```

  **Commit**: YES
  - Message: `feat(ui): add inventory inspector portrait and memory actions`
  - Files: `src/App.tsx`, `src/ui/Inspector.tsx`, UI-only components, `src/simulation/player-actions.ts`
  - Pre-commit: `npm run typecheck`

- [ ] T12. UI lane final regression gate

  **What to do**:
  - Run the full UI branch gate.
  - Capture browser evidence that the existing app shell still works: movement, interaction menu, tabs, controls.

  **Must NOT do**:
  - Do not implement integration-tail hover or in-range rendering here.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: branch verification and evidence capture.
  - **Skills**: [`verification-loop`, `playwright-best-practices`]
    - `verification-loop`: ensure all required evidence exists.
    - `playwright-best-practices`: browser smoke for app-shell regressions.
  - **Skills Evaluated but Omitted**:
    - `vitest`: this lane is primarily UI verification, not new logic testing.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: UI lane tail
  - **Blocks**: F1-F4
  - **Blocked By**: T10, T11

  **References**:
  - `src/App.tsx:216-288` - input/menu handling that must not regress.
  - `src/App.tsx:651-717` - right-panel tabs that must keep working.
  - `README.md:18-24` - canonical control expectations.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck`, `npm test`, and `npm run build` pass on the UI branch.
  - [ ] Browser smoke confirms movement, E interact, Y accept, and panel tabs still work.
  - [ ] No forbidden files are changed.

  **QA Scenarios**:

  ```text
  Scenario: UI branch is merge-ready
    Tool: Playwright
    Preconditions: UI branch dev server running
    Steps:
      1. Open the app and move with `ArrowRight`
      2. Press `E` near an NPC to open/close the interaction menu
      3. Switch between `inspector`, `chat`, and `deliberations` tabs
      4. Capture screenshots and console output
    Expected Result: Existing shell interactions still work after UI additions
    Failure Indicators: Broken keyboard flow, tabs not switching, or runtime exceptions
    Evidence: `.sisyphus/evidence/ui/task-t12-shell.png`, `.sisyphus/evidence/ui/task-t12-console.txt`

  Scenario: UI branch command gate passes
    Tool: Bash
    Preconditions: Same branch after browser smoke
    Steps:
      1. Run `npm run typecheck`
      2. Run `npm test`
      3. Run `npm run build`
    Expected Result: All three commands exit 0
    Failure Indicators: Type or build regressions introduced by App/UI changes
    Evidence: `.sisyphus/evidence/ui/task-t12-typecheck.txt`, `.sisyphus/evidence/ui/task-t12-test.txt`, `.sisyphus/evidence/ui/task-t12-build.txt`
  ```

  **Commit**: NO

- [ ] T13. Tooling A/B scenario runner (`#68`)

  **What to do**:
  - Add the smallest useful A/B scenario runner that can replay the same scenario/seed against two T3 configurations and compare outputs.
  - Keep it tooling-oriented: script/test harness, not app UI.

  **Must NOT do**:
  - Do not build a dashboard or app-surface UI.
  - Do not alter runtime game flow just to support this tool if a script can do it externally.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: isolated tooling work with narrow surface area.
  - **Skills**: [`vitest`]
    - `vitest`: the most likely verification mode for a tooling harness.
  - **Skills Evaluated but Omitted**:
    - `content-engine`: unrelated.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T2, T5, T11
  - **Blocks**: T14, F1-F4
  - **Blocked By**: T1

  **References**:
  - `docs/roadmap-100.md:142-149` - original scope of `#68`.
  - `scripts/orchestrator-run.ts:1-146` - existing script conventions and argument parsing style.
  - `tests/orchestrator.test.ts:51-87` - example of deterministic comparison in tooling/test code.
  - `src/scenarios/small-village.ts:37-67` - fixed-seed scenario bootstrap source.

  **Acceptance Criteria**:
  - [ ] Tool can run the same starting scenario twice with different T3 configs.
  - [ ] Comparison output is saved in a machine-readable or plain-text report.
  - [ ] No runtime app files are modified unless strictly necessary.

  **QA Scenarios**:

  ```text
  Scenario: A/B runner produces a comparison artifact
    Tool: Bash
    Preconditions: Tooling branch implementation complete
    Steps:
      1. Run the new A/B scenario runner with a fixed seed and two stub/live-compatible configs
      2. Save stdout/stderr and generated report
    Expected Result: Runner completes and writes a report comparing the two runs
    Failure Indicators: Script crashes, produces no report, or cannot run deterministically
    Evidence: `.sisyphus/evidence/tooling/task-t13-ab-run.txt`
  ```

  **Commit**: YES
  - Message: `feat(tooling): add deterministic ab scenario runner`
  - Files: tooling script/test files only
  - Pre-commit: `npm test`

- [ ] T14. Sprite-atlas test pass (`#90`)

  **What to do**:
  - Add Vitest coverage for `src/renderer/sprite-atlas.ts`, especially `pickAnimation()` and atlas-frame addressing behavior that can be tested without the browser.
  - Keep any source edits minimal and only for testability if strictly necessary.

  **Must NOT do**:
  - Do not touch `src/renderer/PixiStage.tsx`.
  - Do not expand into unrelated renderer tests.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: narrow test-writing task.
  - **Skills**: [`vitest`]
    - `vitest`: direct overlap with the deliverable.
  - **Skills Evaluated but Omitted**:
    - `playwright-best-practices`: browser testing is not needed for this unit scope.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Tooling sub-lane after T13
  - **Blocks**: F1-F4
  - **Blocked By**: T13

  **References**:
  - `src/renderer/sprite-atlas.ts:38-104` - test target.
  - `tests/behaviors.test.ts:1-60` - concise Vitest style already used in repo.
  - `vitest.config.ts:1-9` - test include pattern and environment.

  **Acceptance Criteria**:
  - [ ] Tests exist for `pickAnimation()` direction selection thresholds.
  - [ ] Tests exist for frame-texture lookup behavior that can be covered without live asset loading, or a narrowly justified testability seam is added.
  - [ ] Tooling branch passes `npm test`.

  **QA Scenarios**:

  ```text
  Scenario: Sprite-atlas tests pass
    Tool: Bash
    Preconditions: Tooling branch after T14 implementation
    Steps:
      1. Run `npm test -- tests/*sprite* src/**/*.test.ts`
      2. Save output
    Expected Result: New sprite-atlas tests pass cleanly
    Failure Indicators: Incorrect animation direction expectations or broken testability seams
    Evidence: `.sisyphus/evidence/tooling/task-t14-tests.txt`

  Scenario: Full tooling branch gate passes
    Tool: Bash
    Preconditions: Same branch after focused tests
    Steps:
      1. Run `npm run typecheck`
      2. Run `npm test`
      3. Run `npm run build`
    Expected Result: Branch is safe to merge into integration
    Failure Indicators: Source changes for testability break app build or types
    Evidence: `.sisyphus/evidence/tooling/task-t14-typecheck.txt`, `.sisyphus/evidence/tooling/task-t14-test.txt`, `.sisyphus/evidence/tooling/task-t14-build.txt`
  ```

  **Commit**: YES
  - Message: `test(renderer): cover sprite atlas helpers`
  - Files: `tests/**`, minimal `src/renderer/sprite-atlas.ts` seam if required
  - Pre-commit: `npm run typecheck && npm test`

- [ ] T15. Integration merge checkpoint

  **What to do**:
  - In `wave1-integration`, merge `wave1-tooling`, `wave1-simulation`, `wave1-ui`, and `wave1-renderer` in the prescribed order.
  - Resolve only genuine merge friction; do not opportunistically rewrite code.
  - Run a full regression gate before starting integration-tail features.

  **Must NOT do**:
  - Do not begin `#8`, `#15`, `#24`, `#37`, `#46`, or `#53` until all merges and regression commands pass.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: merge discipline and validation, not new feature design.
  - **Skills**: [`git-workflow`, `verification-loop`]
    - `git-workflow`: merge sequencing discipline.
    - `verification-loop`: immediate gate after merge.
  - **Skills Evaluated but Omitted**:
    - `playwright-best-practices`: useful later, but first this is a git+build checkpoint.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Integration wave start
  - **Blocks**: T16, T17, F1-F4
  - **Blocked By**: T4, T9, T12, T14

  **References**:
  - Merge policy section in this plan.
  - `package.json:6-18` - required post-merge gate commands.
  - `.handoffs/2026-04-27-wave1-planning.md:58-65` - previously identified cross-lane pitfalls.

  **Acceptance Criteria**:
  - [ ] All four lane branches are merged into integration.
  - [ ] `npm run typecheck`, `npm test`, and `npm run build` pass on the merged integration branch.
  - [ ] Any merge conflict resolution stays inside already-authorized files.

  **QA Scenarios**:

  ```text
  Scenario: Integration branch compiles after merges
    Tool: Bash
    Preconditions: All lane branches are ready to merge
    Steps:
      1. Merge the four lane branches in the prescribed order
      2. Run `npm run typecheck`
      3. Run `npm test`
      4. Run `npm run build`
    Expected Result: Merged branch is green before tail features begin
    Failure Indicators: Any command fails after merge or merge resolutions spill into unrelated files
    Evidence: `.sisyphus/evidence/integration/task-t15-typecheck.txt`, `.sisyphus/evidence/integration/task-t15-test.txt`, `.sisyphus/evidence/integration/task-t15-build.txt`
  ```

  **Commit**: YES
  - Message: `merge(wave1): combine isolated lane branches`
  - Files: merge commit only
  - Pre-commit: `npm run typecheck && npm test && npm run build`

- [ ] T16. Integration effects pass (`#8`, `#15`, `#24`, `#53`)

  **What to do**:
  - Implement the cross-lane renderer/reactive items that now have the necessary merged context:
    - particle bursts on trade/speech
    - camera shake on scenario events
    - sprite tint flash on damage/surprise-style event signals
    - eavesdrop radius visualization
  - Use already-merged world/scenario/action state instead of inventing new global plumbing where avoidable.

  **Must NOT do**:
  - Do not expand this into new scenario systems.
  - Do not alter simulation behavior semantics beyond what is needed to consume merged state.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: event-driven visual effects spanning merged renderer/app state.
  - **Skills**: [`playwright-best-practices`, `verification-loop`]
    - `playwright-best-practices`: browser/timing verification for effects.
    - `verification-loop`: ensure integrated effects do not destabilize the branch.
  - **Skills Evaluated but Omitted**:
    - `vitest`: visual effect timing is better checked in-browser here.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Integration sub-lane after T15
  - **Blocks**: T17, F1-F4
  - **Blocked By**: T15

  **References**:
  - `src/renderer/PixiStage.tsx:166-228` - camera/frame update path where shake layers onto lookahead.
  - `src/simulation/scenarios.ts:34-174` - scenario source events and `broadcastFlash` hooks relevant to camera shake/tint responses.
  - `src/ui/ScenarioOverlay.tsx:24-90` - existing scenario UI overlay, useful as the non-canvas counterpart for the same events.
  - `src/simulation/tick.ts:334-425` - speech/trade side effects that can anchor burst triggers.
  - `src/simulation/player-actions.ts:46-140` - player speech/trade hooks that must also surface integrated visual feedback.

  **Acceptance Criteria**:
  - [ ] Trade/speech can trigger a burst effect.
  - [ ] Scenario events can trigger visible shake without breaking lookahead.
  - [ ] Tint flash/eavesdrop visuals are controllable from merged state.
  - [ ] Integration branch still passes `npm run typecheck`.

  **QA Scenarios**:

  ```text
  Scenario: Scenario-driven camera shake works on top of lookahead
    Tool: Playwright
    Preconditions: Integration branch dev server running
    Steps:
      1. Open the app and wait for `canvas`
      2. In page context, force a scenario event via `window.__OCEAN__.world`/tick advancement until one is active
      3. Capture screenshots during the active scenario banner window
    Expected Result: Camera shake is visible but the app remains playable and lookahead still feels coherent
    Failure Indicators: Violent camera jumps, broken centering, or runtime errors during scenario activation
    Evidence: `.sisyphus/evidence/integration/task-t16-shake-a.png`, `.sisyphus/evidence/integration/task-t16-shake-b.png`

  Scenario: Trade/speech bursts and eavesdrop visuals render without crashing
    Tool: Playwright
    Preconditions: Same app session
    Steps:
      1. Trigger player speech and wait for NPC response/trade activity
      2. Enable eavesdrop visualization if the control exists on this branch
      3. Capture screenshots and console output
    Expected Result: Burst and radius visuals appear, and the app remains stable
    Failure Indicators: No effects, overlapping broken overlays, or console exceptions
    Evidence: `.sisyphus/evidence/integration/task-t16-effects.png`, `.sisyphus/evidence/integration/task-t16-console.txt`
  ```

  **Commit**: YES
  - Message: `feat(integration): add event-driven stage effects`
  - Files: `src/renderer/PixiStage.tsx`, minimal integrated app/UI files if needed
  - Pre-commit: `npm run typecheck`

- [ ] T17. Integration interaction pass (`#37`, `#46`)

  **What to do**:
  - Add hover-to-peek and in-range interaction cues using merged renderer + app state.
  - Keep the tooltip implementation as a React-positioned overlay fed by renderer hover-state, not a full Pixi in-canvas text system.

  **Must NOT do**:
  - Do not redesign selection/interaction architecture.
  - Do not fold this into a generic tooltip system for the entire app.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: hybrid renderer/UI interaction affordance work.
  - **Skills**: [`playwright-best-practices`]
    - `playwright-best-practices`: hover/focus/selector verification is central here.
  - **Skills Evaluated but Omitted**:
    - `shadcn`: not needed for a small custom overlay.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Integration tail end
  - **Blocks**: F1-F4
  - **Blocked By**: T15, T16

  **References**:
  - `src/App.tsx:563-639` - stage wrapper and current absolute overlays; hover-peek overlay should live here.
  - `src/renderer/PixiStage.tsx:263-268` - per-entity pointer event wiring; extend this for hover state emission.
  - `src/simulation/player-actions.ts:23-40` - nearest-interact-target logic that can anchor in-range highlighting.
  - `src/ui/InteractionMenu.tsx:24-89` - current absolute overlay style and positioning conventions.

  **Acceptance Criteria**:
  - [ ] Hovering an entity can reveal a lightweight peek without changing selection.
  - [ ] In-range target cue appears only when interaction is actually available.
  - [ ] Existing click-to-select and menu behavior still work.
  - [ ] Final integration branch passes `npm run typecheck`, `npm test`, and `npm run build`.

  **QA Scenarios**:

  ```text
  Scenario: Hover-to-peek works without selecting
    Tool: Playwright
    Preconditions: Integration branch dev server running
    Steps:
      1. Open the app and wait for `canvas`
      2. Move the mouse over a visible NPC sprite without clicking
      3. Assert a hover overlay/peek appears
      4. Assert the inspector selection state does not change
    Expected Result: Hover reveals name/title info without forcing selection
    Failure Indicators: No hover feedback or hover unexpectedly selects the entity
    Evidence: `.sisyphus/evidence/integration/task-t17-hover.png`

  Scenario: In-range indicator tracks actual interaction availability
    Tool: Playwright
    Preconditions: Same session with player movable
    Steps:
      1. Move near an NPC until interaction is possible
      2. Capture screenshot with the in-range cue visible
      3. Move away until interaction is no longer possible
      4. Capture screenshot again
    Expected Result: Cue appears in range and disappears out of range
    Failure Indicators: Cue is always on, always off, or mismatched to `E` interaction availability
    Evidence: `.sisyphus/evidence/integration/task-t17-in-range.png`, `.sisyphus/evidence/integration/task-t17-out-of-range.png`
  ```

  **Commit**: YES
  - Message: `feat(integration): add hover peek and in-range cues`
  - Files: `src/App.tsx`, `src/renderer/PixiStage.tsx`, small UI overlay component(s)
  - Pre-commit: `npm run typecheck && npm test && npm run build`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  - Verify every scoped item is present.
  - Verify `#94` and all later-wave items are absent.
  - Verify each branch respected its authorized file list.
  - Output: `Scoped items [N/N] | Forbidden items [clean/issues] | File ownership [clean/issues] | VERDICT`

- [ ] F2. **Code Quality + Regression Review** — `unspecified-high`
  - Run `npm run typecheck`, `npm test`, and `npm run build` on the integration branch.
  - Review changed files for dead code, commented-out experiments, `console.log`, or opportunistic refactors.
  - Output: `Typecheck [PASS/FAIL] | Tests [PASS/FAIL] | Build [PASS/FAIL] | VERDICT`

- [ ] F3. **Real Browser + Terminal QA** — `unspecified-high`
  - Start `npm run dev`.
  - Execute the QA scenarios listed in T1–T17.
  - Save screenshots and terminal captures to `.sisyphus/evidence/final-qa/`.
  - Output: `Scenarios [N/N pass] | Console errors [none/issues] | VERDICT`

- [ ] F4. **Scope Fidelity Audit** — `deep`
  - Compare final diff against this plan.
  - Confirm no work outside the scoped item list.
  - Confirm cross-lane items were implemented only in the integration branch.
  - Output: `Scope [clean/issues] | Cross-lane discipline [clean/issues] | VERDICT`

---

## Commit Strategy

- `wave1-renderer`
  - Commit 1: renderer entity presentation pass
  - Commit 2: renderer animation + particles
  - Commit 3: renderer camera + `renderEntity()` tail

- `wave1-simulation`
  - Commit 1: behavior/state foundation
  - Commit 2: new behavior modules
  - Commit 3: replay + regional budget
  - Commit 4: lifecycle/metabolism

- `wave1-ui`
  - Commit 1: controls + HUD
  - Commit 2: player interaction panels/actions
  - Commit 3: inspector portrait

- `wave1-tooling`
  - Commit 1: A/B scenario runner
  - Commit 2: sprite-atlas tests

- `wave1-integration`
  - Commit 1: merge tooling/simulation/UI/renderer
  - Commit 2: scenario-to-camera bridge
  - Commit 3: hover-peek + in-range indicator

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck  # Expected: exit 0
npm test           # Expected: exit 0
npm run build      # Expected: exit 0
```

### Final Checklist
- [ ] Current `docs/plan-wave-1.md` critique is addressed in execution shape
- [ ] `#94` removed from this wave
- [ ] All isolated lanes respected file ownership
- [ ] Integration tail owns every cross-lane item
- [ ] Final verification wave passes

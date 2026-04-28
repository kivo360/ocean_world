HANDOFF CONTEXT
===============

USER REQUESTS (AS-IS)
---------------------
- "understand the plans in the ocean-world directory" — user wanted to understand all existing plan files
- "full analysis of the remaining items with respect to parallelization, DAG, worktree splits, and low-effort/high-reward items" — user wanted deep planning analysis
- "Write it all into a plan file right now." — user wanted the analysis saved as a file
- "Make the plan more clear and more in-depth, and then I'm just going to see how we can spawn off those worktrees." — user wants concrete implementation specs with file:line references, then spawn worktrees

GOAL
----
Rewrite docs/plan-wave-1.md with per-task concrete implementation specs (exact file:line references, code change descriptions, QA scenarios), then spawn 3 parallel git worktrees for Renderer/Simulation/UI+Tooling execution.

WORK COMPLETED
--------------
- I read all key source files (PixiStage.tsx, tick.ts, entity.ts, components.ts, world.ts, App.tsx, Inspector.tsx, Controls.tsx, all behaviors, all UI components, all sim infrastructure)
- I launched 3 background research agents that all completed:
  1. Explore agent: UI components + behavior modules (confirmed MiniMap.tsx, ChatLog.tsx, gossip.ts don't exist)
  2. Explore agent: Sim infrastructure (confirmed audit.ts, test-helpers.ts don't exist)
  3. Librarian agent: PixiJS 8 authoritative patterns (AnimatedSprite, ParticleContainer, camera, tint, React integration)
- I wrote the initial plan to docs/plan-wave-1.md (279 lines) covering collision groups, DAG, ROI tiers, wave strategy
- I committed the plan file (bcd063e)
- I started rewriting the plan with in-depth specs but had not yet written the new version when the handoff was requested

CURRENT STATE
-------------
- Branch: main, clean working tree (all committed)
- Last commit: bcd063e "docs: add wave 1 execution plan for remaining roadmap items"
- docs/plan-wave-1.md exists with the HIGH-LEVEL analysis (collision groups, DAG, tiers, waves) but NOT the IN-DEPTH per-task implementation specs
- No worktrees have been spawned yet
- No code changes beyond the plan file

PENDING TASKS
-------------
P0: Rewrite docs/plan-wave-1.md with in-depth specs for each item:
    - Per-task: exact file:line references, code change descriptions, QA scenarios
    - Three worktree sections (Renderer, Simulation, UI+Tooling) with concrete instructions
    - Dependency matrix showing exact file collision risks
    - Worktree spawn commands ready to paste
P1: Spawn 3 parallel git worktrees:
    - Renderer worktree: ~18 PixiStage items (#2,#7,#8,#9,#12,#14,#15,#17,#18,#21,#22,#23,#24,#25,#44,#46,#53,#92)
    - Simulation worktree: ~13 behavior/tick items (#55,#56,#57,#59,#61,#62,#65,#66,#67,#71,#72,#73,#75)
    - UI+Tooling worktree: ~13 UI items (#16,#36,#37,#39,#43,#45,#47,#49,#50,#52,#68,#90,#94)

KEY FILES
---------
- docs/plan-wave-1.md — Current plan (279 lines, needs in-depth rewrite)
- src/renderer/PixiStage.tsx (406 lines) — All renderer items. EntityGfx L18-27, camera L174-228, sprite anim L299-320, energy bar L329-332, selection ring L373-384, entity create L233-291, render loop L230-363
- src/simulation/tick.ts (516 lines) — All sim items. evaluateBehavior L117-155, decide L157-230, applyMove L307-325, passiveDecay L462-479, runTick L487-516
- src/App.tsx (722 lines) — UI wiring. shift=run L313-316, speed buttons L52, header L481-520
- src/simulation/entity.ts (48 lines) — BehaviorName union (must extend for new behaviors)
- src/simulation/components.ts (63 lines) — PhysicalState, Values, CognitiveState
- src/simulation/world.ts (203 lines) — World type, createWorld, findNearby, emit
- src/behaviors/registry.ts (16 lines) — Imports all behaviors, exports REGISTRY
- src/behaviors/wander.ts (42 lines) — Reference pattern for new behaviors

IMPORTANT DECISIONS
-------------------
- Three parallel worktrees by file collision domain (Renderer/Sim/UI)
- #92 (PixiStage refactor) goes LAST in renderer worktree
- Wave ordering: Layer 0 (parallel) → Layer 1 (depends on L0) → Layer 2 (biomes, Phase 4) → Layer 3 (multi-region)
- New behaviors follow wander.ts pattern: BehaviorModule { name, score(), decide() }
- PixiJS 8: Only Containers have children, ParticleContainer uses addParticle() not addChild(), tint multiplies through hierarchy
- Missing files (audit.ts, test-helpers.ts, MiniMap.tsx, ChatLog.tsx, gossip.ts) simply don't exist yet

EXPLICIT CONSTRAINTS
--------------------
- "Make the plan more clear and more in-depth" — concrete specs, not vague descriptions
- "I'm just going to see how we can spawn off those worktrees" — worktree spawn commands needed

CONTEXT FOR CONTINUATION
------------------------
Research is COMPLETE. All source files read, all agents returned. What remains is WRITING the in-depth plan.

Renderer worktree PixiJS 8 patterns:
- Particles: Graphics-based (not ParticleContainer), spawn/animate alpha/position/destroy
- Camera shake: Random offset worldLayer.position, decay over frames
- Lookahead: Offset desX/desY by velocity fraction before clamp (PixiStage.tsx L203-208)
- Day/night: Overlay Graphics on worldLayer, alpha from (tick % CYCLE)/CYCLE
- Selection glow: Animate selectionRing alpha with sin(now) (PixiStage.tsx L373-384)
- Energy gradient: Lerp green/yellow/red based on s.energy (PixiStage.tsx L332)
- Idle bob: sin(now * freq) * amp added to group.position.y (PixiStage.tsx L293)

Simulation worktree behavior pattern (copy from wander.ts):
- score() returns [0,1] utility, often value-weighted (0.6 + 0.4 * fairness)
- decide() uses phase state machine with setBehaviorPhase()
- Must extend BehaviorName union in entity.ts + import in registry.ts + add valueWeight case in tick.ts

The plan file at docs/plan-wave-1.md needs to be rewritten (not appended) with the in-depth specs. All research data is in this session's compressed blocks (b1-b4). Re-read source files if exact line numbers are needed — they haven't changed since the plan commit.

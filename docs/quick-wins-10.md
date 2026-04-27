# Quick Wins — 10 Phase-1-Independent Items

Companion to `roadmap-100.md` and `plan-phase-1.md`. These ten items:

- Are **not** in Phase 1 and don't depend on Phase 1 landing first.
- Touch files mostly **disjoint from Phase 1** (which lives in
  `PixiStage.tsx` / `sprite-atlas.ts` / `public/sprites/`).
- Are picked for **payoff ÷ effort** — every one of them either catches
  bugs forever, removes manual friction, or adds a visible-to-stakeholders
  feature in under 2 hrs.

If you fan out N agents on the same tree, the table below tells you which
pairs can run truly in parallel without ever touching the same file.

---

## Parallel-safety matrix

| # | Item | Files touched | Phase-1 collision? | Effort |
|---|------|----------------|---------------------|--------|
| 91 | CI typecheck+tests | `.github/workflows/ci.yml` (new) | none | 15 min |
| 88 | Vite auto-copy plugin | `vite.config.ts`, `tools/sprite-forge-vite-plugin.ts` (new) | none | 30 min |
| 89 | `pull-lpc` from manifest | `tools/sprite-forge/scripts/pull-lpc.ts` (new), `tools/sprite-forge/lpc.manifest.json` (new) | none | 30 min |
| 93 | Component-scoped CLAUDE.md | `src/renderer/CLAUDE.md`, `src/simulation/CLAUDE.md`, `ontology/CLAUDE.md` (all new) | none | 30 min |
| 74 | Conservation-law audit | `src/simulation/audit.ts` (new), `tests/audit.test.ts` (new) | none | 30 min |
| 76 | Determinism test suite | `tests/determinism.test.ts` (new) | none | 60 min |
| 40 | Mini-map | `src/ui/Minimap.tsx` (new), `src/App.tsx` (mount in JSX) | low: only adds a JSX line | 60 min |
| 38 | Conversation log panel | `src/ui/ChatLog.tsx` (new), `src/App.tsx` (mount in JSX) | **collides with #40 on App.tsx**; serialise these two | 60 min |
| 78 | Versioned ontology snapshots | `scripts/codegen.ts` (edit), `ontology/snapshots/` (new dir) | none | 90 min |
| 54 | Gossip behavior | `src/behaviors/gossip.ts` (new), `src/simulation/entity.ts` (one line: `BehaviorName` union), `src/simulation/decide.ts` (one branch) | none | 120 min |

**Pure-parallel pairs** (truly safe, even on a shared tree):
`(91, 88)`, `(91, 89)`, `(91, 93)`, `(74, 76)`, `(78, 54)`, `(88, 89)`,
`(40, 78)`, `(40, 54)` …

**Sequence required:**
- `#40` and `#38` both add a `<Component />` line to `App.tsx`. Land one,
  rebase the other.
- Phase 1 `#5` (atlas regen) eventually rewrites `public/sprites/atlas.png`
  — `#88`'s plugin will start auto-copying it once Phase 1 lands. They
  cooperate, never conflict.

---

## Item details

### #91 — CI: typecheck + tests on push

**Why:** catches every regression these ten items might introduce, and every
future regression. Highest payoff:effort on the list.

**Files (new):** `.github/workflows/ci.yml`

**Approach:**
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: cd tools/sprite-forge && npm ci && npm run build
```

**Acceptance:** open a PR with a deliberate type error → CI fails. Open a
green PR → CI passes.

---

### #88 — Vite plugin: auto-copy sprite-forge output

**Why:** Every atlas regen currently requires `cp tools/sprite-forge/out/.../* public/sprites/`. Removes that manual step forever.

**Files (new):** `tools/sprite-forge-vite-plugin.ts`. **Edit:** `vite.config.ts` (one line).

**Approach:** A tiny Vite plugin that watches
`tools/sprite-forge/out/archetypes/atlas/{atlas.png,manifest.json}` and copies
them into `public/sprites/` on dev start and on file change.

```typescript
// tools/sprite-forge-vite-plugin.ts
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync, watch } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

const SRC_DIR = resolve("tools/sprite-forge/out/archetypes/atlas");
const DST_DIR = resolve("public/sprites");
const FILES = ["atlas.png", "manifest.json"];

async function copyAll() {
  if (!existsSync(SRC_DIR)) return;
  await mkdir(DST_DIR, { recursive: true });
  for (const f of FILES) {
    const src = resolve(SRC_DIR, f);
    if (existsSync(src)) await copyFile(src, resolve(DST_DIR, f));
  }
}

export function spriteForgePlugin(): Plugin {
  return {
    name: "sprite-forge-autocopy",
    async buildStart() { await copyAll(); },
    async configureServer() {
      await copyAll();
      if (existsSync(SRC_DIR)) {
        watch(SRC_DIR, { recursive: false }, () => copyAll().catch(() => {}));
      }
    },
  };
}
```

In `vite.config.ts`:
```typescript
import { spriteForgePlugin } from "./tools/sprite-forge-vite-plugin";
// ...
plugins: [react(), spriteForgePlugin()],
```

**Acceptance:** `rm public/sprites/atlas.png && npm run dev` → file is back
within a second. Re-run sprite-forge → public copy auto-updates.

---

### #89 — `npm run pull-lpc` from a manifest

**Why:** today the LPC pull is an ad-hoc bash loop. Reproducible-from-clean
checkout is a foundational property — without it, future-you re-discovers
the right URLs.

**Files (new):** `tools/sprite-forge/scripts/pull-lpc.ts`, `tools/sprite-forge/lpc.manifest.json`.

**Approach:** Manifest is a JSON list of `{ src: relPath, dest: relPath }`
entries; script downloads each via `fetch`, parallelised.

```typescript
// tools/sprite-forge/lpc.manifest.json
{
  "base": "https://raw.githubusercontent.com/jrconway3/Universal-LPC-spritesheet/master",
  "files": [
    { "path": "body/male/light.png" },
    { "path": "body/male/dark.png" },
    { "path": "hair/male/bangs/brunette.png" },
    /* ...all 21 files we currently have on disk... */
  ]
}
```

```typescript
// scripts/pull-lpc.ts (sketch)
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const manifest = JSON.parse(await readFile("lpc.manifest.json", "utf-8"));
await Promise.all(manifest.files.map(async (f) => {
  const dst = resolve("fixtures/lpc-real", f.path);
  await mkdir(dirname(dst), { recursive: true });
  const res = await fetch(`${manifest.base}/${f.path}`);
  if (!res.ok) throw new Error(`${res.status} ${f.path}`);
  await writeFile(dst, new Uint8Array(await res.arrayBuffer()));
}));
```

Wire as `"pull-lpc": "tsx scripts/pull-lpc.ts"` in
`tools/sprite-forge/package.json`.

**Acceptance:** `rm -rf fixtures/lpc-real && npm run pull-lpc` rebuilds the
fixture tree from scratch in <10s.

---

### #93 — Component-scoped CLAUDE.md

**Why:** future agents (you, future-Claude) lose 10–20 minutes re-deriving
the renderer's mental model on every new session. Three small notes fix that.

**Files (new):** `src/renderer/CLAUDE.md`, `src/simulation/CLAUDE.md`, `ontology/CLAUDE.md`.

**Approach:** Each is ~30 lines. Cover only what's non-obvious from reading
the code:

- `renderer/CLAUDE.md`: how the gfx-cache works, how snapshots flow in,
  Pixi v8 quirks (no `BaseTexture`, use `source.scaleMode = "nearest"`).
- `simulation/CLAUDE.md`: T1/T2/T3 split, behavior dispatch, the
  cross-entity graph, deterministic RNG seeding.
- `ontology/CLAUDE.md`: codegen path, Oxigraph reasoner gating, where to
  add new components vs new behaviors.

**Acceptance:** drop a fresh agent in `src/renderer/`, ask "how does
animation timing work" — answer derives from CLAUDE.md, not from reading
PixiStage.tsx end-to-end.

---

### #74 — Conservation-law audit

**Why:** trade & deliberation can leak money/goods if a behavior bug
exists. An audit catches it the first time it happens.

**Files (new):** `src/simulation/audit.ts`, `tests/audit.test.ts`.

**Approach:** A pure function `auditWorld(w): {moneyTotal, goodsTotal}`.
Wire into the test that runs 1000 ticks of a known scenario and asserts
both totals are constant (or move only by player-action deltas).

```typescript
// audit.ts
export function auditWorld(w: World) {
  let money = 0, goods = 0;
  for (const e of w.entities.values()) {
    money += e.components.economic?.money ?? 0;
    goods += e.components.economic?.goods ?? 0;
  }
  return { money, goods };
}
```

```typescript
// audit.test.ts
import { test, expect } from "vitest";
import { buildWorldWithPlayer } from "...";
import { tick } from "...";
import { auditWorld } from "../src/simulation/audit";

test("trade conserves money + goods over 500 ticks", () => {
  const w = buildWorldWithPlayer({ seed: 42, scenario: "default" });
  const before = auditWorld(w);
  for (let i = 0; i < 500; i++) tick(w);
  const after = auditWorld(w);
  expect(after.money).toBe(before.money);
  expect(after.goods).toBe(before.goods);
});
```

**Acceptance:** test goes green; if anyone introduces a leak, CI flags it.

---

### #76 — Decision-determinism test suite

**Why:** sim accuracy story rests on "same seed → same outcome". Locking
that in protects every later cleverness from accidental non-determinism.

**Files (new):** `tests/determinism.test.ts`.

**Approach:** Run a fixed scenario for N ticks, hash the snapshot, compare
to a frozen golden hash. First run captures the hash; subsequent runs assert.

```typescript
import crypto from "node:crypto";
import { test, expect } from "vitest";

test("seed 42 + scenario default → stable snapshot hash at tick 200", () => {
  const w = buildWorldWithPlayer({ seed: 42, scenario: "default" });
  for (let i = 0; i < 200; i++) tick(w);
  const snap = JSON.stringify(snapshot(w));
  const hash = crypto.createHash("sha256").update(snap).digest("hex");
  expect(hash).toBe("EXPECTED_HASH_HERE"); // capture on first run
});
```

T3 LLM calls are nondeterministic — either stub them (return fixed strings
for the test) or run with `T3 off`. Document which.

**Acceptance:** test green on every run; if T3 stubbing leaks
nondeterminism in, CI flags it.

---

### #40 — Mini-map

**Why:** one of the highest "feels like a real game" upgrades that doesn't
touch the renderer. Just a small React component reading the same snapshots.

**Files (new):** `src/ui/Minimap.tsx`. **Edit:** `src/App.tsx` (one line: `<Minimap />`).

**Approach:** Fixed-position canvas in top-right. Each frame, draw region
outlines (from world bounds) and a coloured pixel per entity (colour by
archetype). Player is a slightly larger dot.

```tsx
export function Minimap({ getSnapshots, worldWidth, worldHeight }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = ref.current; if (!c) return;
      const ctx = c.getContext("2d")!;
      const sx = c.width / worldWidth, sy = c.height / worldHeight;
      ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, c.width, c.height);
      for (const s of getSnapshots()) {
        ctx.fillStyle = s.archetype === "Player" ? "#fff" : ARCHETYPE_HEX[s.archetype];
        const r = s.archetype === "Player" ? 2 : 1;
        ctx.fillRect(s.x * sx - r, s.y * sy - r, r * 2, r * 2);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldWidth, worldHeight, getSnapshots]);
  return <canvas ref={ref} width={140} height={94}
    style={{ position: "fixed", top: 12, right: 12, border: "1px solid #1e293b" }} />;
}
```

**Acceptance:** mini-map visible top-right; player dot moves as the player
walks; NPC dots roam.

---

### #38 — Conversation log panel

**Why:** speech bubbles vanish in <2s and there's no scrollback. A persistent
chat log per entity (or globally) makes it possible to review what just
happened.

**Files (new):** `src/ui/ChatLog.tsx`. **Edit:** `src/App.tsx` (mount).

**Approach:** Maintain a ring buffer of `(t, speakerId, text)` tuples,
appended whenever a snapshot's `speechBubble` field changes from the previous
sample. Render as a scrollable list, capped at last 200 entries.

Conflict note: `App.tsx` JSX edit overlaps with `#40`'s mount — land one,
rebase the other.

**Acceptance:** open the panel, walk the world for 1 minute, scroll back
through every utterance.

---

### #78 — Versioned ontology snapshots

**Why:** foundation for the Phase 4 "moat" items. Without snapshots, you
can't show ontology drift, can't diff between codegens, can't tell stories
about emergence.

**Files:** `scripts/codegen.ts` (edit). **New dir:** `ontology/snapshots/`.

**Approach:** at the end of `codegen.ts`, hash the generated ontology JSON,
write a copy to `ontology/snapshots/{ISO-date}-{hashprefix}.json`. Keep the
last N (say 50) snapshots; prune older.

```typescript
import { createHash } from "node:crypto";
import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
const json = JSON.stringify(generated, null, 2);
const hash = createHash("sha256").update(json).digest("hex").slice(0, 8);
const date = new Date().toISOString().slice(0, 10);
const dir = "ontology/snapshots";
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/${date}-${hash}.json`, json);

// prune older than 50
const all = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
for (const f of all.slice(0, Math.max(0, all.length - 50))) {
  await unlink(`${dir}/${f}`);
}
```

**Acceptance:** every codegen leaves a new file; a `git diff` between two
adjacent snapshots shows what changed in the ontology.

---

### #54 — Gossip behavior

**Why:** the single biggest "this world feels alive" multiplier among the
behavior items. Speech information propagates via NPCs even when the
original speaker isn't present, which feels emergent.

**Files (new):** `src/behaviors/gossip.ts`. **Edit:** `src/simulation/entity.ts` (add `"Gossip"` to `BehaviorName` union; one-line change). **Edit:** `src/simulation/decide.ts` or wherever behaviors are dispatched.

**Approach:** When NPC A is near NPC B, and A's perceived buffer contains
recent speech from someone *not* B, A may retell that speech to B. Each
retelling decays fidelity (replace 1 word with `[?]` per hop, or drop
trailing tokens). Store the gossip chain in the cross-entity graph so
recall is possible.

```typescript
// gossip.ts (skeleton)
export const Gossip: Behavior = {
  name: "Gossip",
  decide(self, world) {
    const heard = self.components.perceived?.recentSpeech ?? [];
    const target = nearestEntity(self, world, /*radius*/ 60);
    if (!target || heard.length === 0) return null;
    const item = world.rng.pick(heard);
    if (item.from === target.id) return null;
    return {
      action: "speak",
      target: target.id,
      text: decay(item.text),
      meta: { gossip: true, originalFrom: item.from },
    };
  },
};
```

Wire into the decide-loop's behavior selection (probably weighted by
curiosity / sociability values).

**Acceptance:** start a sim, have one NPC announce a unique phrase, walk
away. Within 200 ticks, watch the phrase propagate (with decay) to NPCs
who never met the original speaker.

---

## Worktree quick-recipe (since you asked)

For when you do want to keep agents truly off each other's toes:

```sh
# create an isolated checkout of a new branch off main
git worktree add ../ocean-world-mini-map -b mini-map main
cd ../ocean-world-mini-map
# work, commit, push as normal
# returns a different working dir; same .git, separate index

# when done with that branch's work
cd ../ocean-world
git worktree remove ../ocean-world-mini-map
```

Pitfalls that bite people:
- **Don't** check out the same branch in two worktrees — git refuses
  unless you use `--force`. The fix is to give each worktree its own branch.
- **Don't** run `npm install` and expect it to be shared — each worktree
  has its own `node_modules`. That's a feature, not a bug; it's why
  you can run two dev servers without lockfile fights.
- **Do** keep your main checkout for code review / merging; do work in
  worktrees. Bring branches back via PR or `git merge`.

For a 10-item-parallel push, three worktrees (UI / sim / tooling) tends
to be enough — each one has 3–4 items in the same neighborhood and
naturally avoids the hot-file conflicts.

# Phase 1 — Visual Baseline: Detailed Plan

Six items, ~3–4 hours total. After landing all six, the demo no longer reads
as a tech sketch. Suggested order is top-to-bottom because each later item
benefits from the earlier ones being in place (smooth motion + shadows make
sprites read better; tile ground makes shadows visible; etc).

Item numbers reference `roadmap-100.md`.

---

## Item #6 — Lerp positions between sim ticks

**Goal:** NPCs glide between positions instead of teleporting once per tick. At
1× sim speed (100 ms/tick), the eye sees a teleport every 100 ms today.

**Why first:** every later item looks worse against teleporting motion; this
makes everything else feel polished.

**Files:**
- `src/renderer/PixiStage.tsx` (only)

**Approach:** per-entity exponential smoothing (critical-damping filter)
toward the snapshot's `(x, y)`. Avoids needing to detect tick boundaries.
Player is exempt because its position is updated every RAF by the input
handler — applying a filter on top would add input lag.

**Code sketch:**

```typescript
type EntityGfx = {
  // ...existing fields
  // Smoothing state for non-player entities. lastFrameMs lets us compute dt;
  // smoothX/Y hold the rendered position which trails the simulation by ~100ms.
  smoothX?: number;
  smoothY?: number;
  lastFrameMs?: number;
};

const SMOOTH_HALF_LIFE_MS = 80; // 80ms to halve the gap; ~150ms to look caught up

// Inside per-entity loop:
const isPlayer = s.archetype === "Player";
if (isPlayer) {
  g.group.position.set(s.x, s.y);
} else {
  const lastMs = g.lastFrameMs ?? now;
  const dt = Math.min(100, now - lastMs); // cap to avoid huge jumps on tab focus
  g.lastFrameMs = now;
  if (g.smoothX === undefined) {
    g.smoothX = s.x;
    g.smoothY = s.y;
  } else {
    // exp(-dt * ln(2) / halfLife) is the fraction of error remaining
    const k = 1 - Math.pow(0.5, dt / SMOOTH_HALF_LIFE_MS);
    g.smoothX += (s.x - g.smoothX) * k;
    g.smoothY += (s.y - g.smoothY!) * k;
  }
  g.group.position.set(g.smoothX, g.smoothY!);
}
```

**Acceptance:**
- At 1× sim speed: NPC motion is visually smooth (no teleports).
- At 5×/10× sim speed: NPCs may snap to next position; that's fine.
- Player movement still feels instant (zero filter latency).
- Tab-switching doesn't cause a long jump (the dt cap kicks in).

**Effort:** ~30 LoC, ~30 min.

**Test plan:**
- Manual: start dev, set speed to 1×, watch one Wander NPC for 10s — it should
  glide in straight lines, not teleport.
- Edge case: switch tabs for 5s, switch back; verify no visible "catch-up"
  jump (the cap on `dt` should prevent it).

---

## Item #26 — Tile-based ground (TilingSprite)

**Goal:** Replace the flat blue background + grid lines with a grass-tile
ground. Single biggest screenshot upgrade.

**Why second:** lerp is in place so the new ground doesn't fight with motion;
later items (shadows, etc.) need a ground for shadows to land on.

**Files:**
- `tools/sprite-forge/scripts/pull-lpc.ts` (new — small fetch helper)
- `public/sprites/terrain/grass.png` (new — fetched asset)
- `src/renderer/PixiStage.tsx`

**Approach:**
1. Fetch one 32×32 grass tile from the LPC repo. The Universal-LPC repo has
   `_build/spritesheets/...` but for a single tile we'll grab one prepared
   tile from the OpenGameArt LPC tile pack — easiest source is one of the
   forks that bundle ready tiles. (If picking up a specific URL is awkward,
   fall back to a hand-drawn 32×32 grass texture inline as data URL.)
2. Replace the grid `Graphics` with a Pixi `TilingSprite`.

**Code sketch (renderer):**

```typescript
import { Assets, TilingSprite } from "pixi.js";

// In the init effect:
const grassTex = await Assets.load<Texture>("/sprites/terrain/grass.png");
if ("scaleMode" in grassTex.source) {
  (grassTex.source as { scaleMode: string }).scaleMode = "nearest";
}
const ground = new TilingSprite({
  texture: grassTex,
  width: worldDimsRef.current.w,
  height: worldDimsRef.current.h,
});
worldLayer.addChild(ground); // before entityLayer so it draws below

// Optional: keep the grid as a faint overlay for debug
// const grid = new Graphics(); ... worldLayer.addChild(grid);
```

**Acceptance:**
- Background is grassy, tiling cleanly across the world.
- Camera pan still feels right (TilingSprite is in worldLayer so it pans).
- Sprites readable on grass — if not, dim the grass with a 30% black overlay
  rect.

**Effort:** ~1 hr (mostly fetching/picking the right tile source).

**Test plan:**
- Visual: grass visible, no seams between tiles.
- Performance: framerate should not drop (TilingSprite is GPU-side).
- Bonus: confirm texture wraps correctly at world bounds.

**Fallback:** if no tile source is convenient, ship with a hand-painted 32×32
data-URL tile (a procedural noise pattern in green) until a real tile lands.

---

## Item #3 — Drop-shadow under sprites

**Goal:** Each sprite gets a soft elliptical shadow at its feet. Grounds the
character visually, fakes depth.

**Why third:** needs ground (so shadow has something to land on) and lerp
(so the shadow moves smoothly with the character).

**Files:**
- `src/renderer/PixiStage.tsx`

**Approach:** add a `shadow` Graphics to each entity's group, drawn first
(so it goes under the body). Sized to the sprite footprint, low alpha.

**Code sketch:**

```typescript
type EntityGfx = {
  // ...existing fields
  shadow?: Graphics;
};

// During gfx creation (before adding body to group):
if (atlas && atlas.hasCharacter(s.archetype)) {
  const shadow = new Graphics();
  shadow.ellipse(0, 4, 7, 2.5).fill({ color: 0x000000, alpha: 0.35 });
  group.addChild(shadow); // before body
  g.shadow = shadow;
}
```

**Acceptance:**
- Sprites have a visible drop-shadow ellipse at their feet.
- Shadow stays anchored relative to the sprite (rides along with sprite.y).
- Circle-fallback entities don't need shadows (they already feel grounded
  via the dark stroke).

**Effort:** ~10 LoC, ~10 min.

**Test plan:** visual — shadows visible at multiple zoom levels; not visible
under speech bubbles or selection ring.

---

## Item #13 — Z-sort entities by y

**Goal:** When a character stands behind another, the further-back one renders
behind. Without this, draw order = insertion order, which looks wrong.

**Why fourth:** shadows and ground are in place; sorting now finishes the
"layered top-down" look.

**Files:**
- `src/renderer/PixiStage.tsx`

**Approach:** Pixi's built-in `sortableChildren = true` on `entityLayer`,
plus per-frame `group.zIndex = s.y` assignment.

**Code sketch:**

```typescript
// During entityLayer creation:
entityLayer.sortableChildren = true;

// In the per-entity render loop (after position update):
g.group.zIndex = Math.round(s.y);
```

**Acceptance:**
- When two characters overlap, the one with the higher y (further down on
  screen, "closer to camera") draws on top.
- Re-confirm: shadows still visible (each shadow is inside its own group, so
  z-sort applies to whole groups, which is what we want).

**Effort:** ~5 LoC, ~5 min.

**Test plan:** drive the player on top of an NPC and rotate around them; the
overlap should always look correct.

---

## Item #1 — Hysteresis on direction snap

**Goal:** A 45° NE walk shouldn't strobe between walk-e and walk-n. The
sprite should pick one cardinal and stay there until the dominant axis
clearly flips.

**Why fifth:** small polish, but at this point all other diagonals matter
visually because shadows + z-sort make orientation more readable.

**Files:**
- `src/renderer/sprite-atlas.ts` (extend `pickAnimation` signature)
- `src/renderer/PixiStage.tsx` (pass current animation in)

**Approach:** pickAnimation takes the current animation as input. If the
new desired animation differs from current, only flip when the dominant axis
is significantly stronger (ratio > 1.5). For idle ↔ walk transitions, no
hysteresis needed — those are unambiguous.

**Code sketch:**

```typescript
// sprite-atlas.ts
export function pickAnimation(
  dx: number,
  dy: number,
  current?: string,
  threshold = 0.5,
  flipRatio = 1.5,
): string {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < threshold && ay < threshold) return "idle";

  // No hysteresis when coming from idle — pick the dominant axis.
  if (!current || current === "idle") {
    return ax >= ay ? (dx > 0 ? "walk-e" : "walk-w") : (dy > 0 ? "walk-s" : "walk-n");
  }

  const isCurrentHorizontal = current === "walk-e" || current === "walk-w";
  // Stay on horizontal unless vertical dominates by `flipRatio`.
  if (isCurrentHorizontal) {
    if (ay > ax * flipRatio) return dy > 0 ? "walk-s" : "walk-n";
    // Allow swap within horizontal (e.g. walk-e → walk-w on direction flip).
    return dx > 0 ? "walk-e" : "walk-w";
  } else {
    if (ax > ay * flipRatio) return dx > 0 ? "walk-e" : "walk-w";
    return dy > 0 ? "walk-s" : "walk-n";
  }
}

// PixiStage.tsx — pass current animation in:
const desired = pickAnimation(dx, dy, ss.animName);
```

**Acceptance:**
- Hold W+D from a standing start: sprite settles on walk-e (or walk-n,
  whichever direction was first dominant) and stays there.
- Rapidly tapping W and D doesn't strobe.
- Releasing keys returns to idle.
- Pure cardinal motion behaves identically to before.

**Effort:** ~15 LoC, ~15 min.

**Test plan:**
- Manual: hold W+D for 3s, confirm no strobe.
- Unit test: `pickAnimation(1, -1, "walk-e")` returns `"walk-e"`;
  `pickAnimation(0.3, -1, "walk-e")` returns `"walk-n"` (ay clearly dominant).

---

## Item #5 — Per-instance palette variation

**Goal:** Each Person/Merchant/etc. spawn picks one of several visual variants
deterministically from its entity id. Solves the "60 identical Persons" problem.

**Why sixth:** the visual baseline is in place; this is the only item left
where artistry compounds with scale (more NPCs = more visible variety).

**Files:**
- `tools/sprite-forge/examples/archetypes.json` (add variants)
- `tools/sprite-forge/fixtures/lpc-real/` (pull a few more hair/clothing files)
- Re-run sprite-forge, copy atlas to `public/sprites/`
- `src/renderer/sprite-atlas.ts` (variant lookup)
- `src/renderer/PixiStage.tsx` (pick variant per entity)

**Approach:**
1. In the sprite-forge config, add 3 named variants per archetype:
   `Person:0` (current default), `Person:1` (different hair + shirt),
   `Person:2` (different hair + pants). Same for Merchant, Wanderer, etc.
2. In the renderer, when creating a sprite for an entity, hash its id to a
   variant index and look up `${archetype}:${idx}` in the atlas.

**Code sketch (atlas):**

```typescript
// sprite-atlas.ts
private hashToInt(id: string): number {
  // FNV-1a 32-bit; deterministic & cheap
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

variantIdsFor(archetype: string): string[] {
  return this.manifest.characters
    .map((c) => c.id)
    .filter((id) => id === archetype || id.startsWith(`${archetype}:`));
}

resolveCharacterId(archetype: string, entityId: string): string | null {
  const variants = this.variantIdsFor(archetype);
  if (variants.length === 0) return null;
  return variants[this.hashToInt(entityId) % variants.length] ?? null;
}
```

**Code sketch (renderer):**

```typescript
// In gfx creation:
const charId = atlas.resolveCharacterId(s.archetype, s.id);
if (charId) {
  const tex = atlas.frameTexture(charId, "idle", 0)!;
  // ...sprite with this charId
  spriteState.charId = charId; // store for later frame lookups
}

// In animation update:
const tex = atlas.frameTexture(spriteState.charId, ss.animName, ss.frameIdx);
```

**Acceptance:**
- A scene with 30 Persons shows 3 visibly distinct looks.
- The same entity gets the same variant across renders (deterministic).
- Adding a 4th variant just means another row in `archetypes.json` — no code
  changes.

**Effort:** ~1 hr.
- 20 min: pull 4–6 more LPC files (bedhead/bunches hair × shirts already on
  disk; mostly need to re-run pull script).
- 20 min: extend `archetypes.json`, re-run sprite-forge, copy to public/.
- 20 min: code variant resolver and wire it.

**Test plan:**
- Visual: hot-reload, count distinct silhouettes among Persons.
- Determinism: refresh the page; same Yara-1z should still look the same.
- Cache check: sprite-forge re-run should hit the cache for unchanged
  variants (compose cache should be near 100%).

---

## Item #11 — Speech-bubble tails + polish

**Goal:** Speech bubbles look like actual speech bubbles — rounded rect with
a downward triangular tail pointing at the speaker — instead of floating
text with a stroke.

**Why last:** UI polish; once the world looks right, the floating text is
the most obviously "tech demo" element.

**Files:**
- `src/renderer/PixiStage.tsx` (replace bubble Text with a Container)

**Approach:** build a `Bubble` Container per entity: `Graphics` for
rounded-rect background + tail, `Text` on top.

**Code sketch:**

```typescript
function makeBubble(text: string): Container {
  const c = new Container();
  const txt = new Text({ text, style: BUBBLE_STYLE });
  txt.anchor.set(0.5, 0.5);
  const padX = 4;
  const padY = 2;
  const w = txt.width + padX * 2;
  const h = txt.height + padY * 2;

  const bg = new Graphics();
  // Rounded rect body
  bg.roundRect(-w / 2, -h, w, h, 4).fill({ color: 0x1f2937, alpha: 0.92 });
  bg.roundRect(-w / 2, -h, w, h, 4).stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
  // Triangular tail pointing down at speaker
  bg.moveTo(-3, 0).lineTo(0, 4).lineTo(3, 0).fill({ color: 0x1f2937, alpha: 0.92 });

  txt.position.set(0, -h / 2);
  c.addChild(bg);
  c.addChild(txt);
  return c;
}

// In gfx creation, replace existing bubble Text with a Container
const bubble = new Container(); // empty by default
bubble.visible = false;

// In render loop, when speech changes:
if (s.speechBubble && bubble.children.length === 0) {
  // Build fresh bubble. (Naive: rebuild each text change. Optimization later.)
  const b = makeBubble(s.speechBubble);
  bubble.removeChildren();
  bubble.addChild(b);
  bubble.visible = true;
} else if (!s.speechBubble) {
  bubble.visible = false;
}
bubble.position.set(0, headTopY);
```

**Acceptance:**
- Bubbles have a visible rounded background, white-ish text, and a
  triangular tail pointing at the speaker.
- Multiple bubbles don't visually collide (existing offsets handle this OK
  for now).
- Long text wraps or is truncated reasonably (existing TextStyle handles).

**Effort:** ~50 LoC, ~30 min. Could spend more time on text wrap, multiple
bubble stacking, fade-in animation — defer all of that to later polish.

**Test plan:**
- Visual: trigger several speech events, watch bubbles appear with tails.
- Edge case: very long text — verify it doesn't extend past screen edges
  (consider clamping text width).

---

## Sequencing & rollback

Suggested commit shape: **one commit per item**. That makes it easy to
bisect if anything regresses, and each commit by itself has demo value.

Each item is independently revertable; nothing in the list creates a
dependency strong enough that rolling back item N requires rolling back N+1.

After all six land, take a fresh screenshot and compare to today's. If the
screenshot doesn't read as "indie game", look at the order — usually the
fix is more variety (#5 needs more variants) or stronger ground texture
(#26 needs a more contrasted tile).

## Total budget

| Item | Effort |
|------|--------|
| #6 lerp | 30 min |
| #26 tile ground | 60 min |
| #3 drop shadow | 10 min |
| #13 z-sort | 5 min |
| #1 hysteresis | 15 min |
| #5 palette variation | 60 min |
| #11 bubble tails | 30 min |
| **total** | **~3.5 hrs** |

That includes typecheck and visual verification per step. Add another ~30 min
for the inevitable Pixi-API quirks (`scaleMode`, `sortableChildren` etc.).

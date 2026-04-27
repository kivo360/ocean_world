# src/renderer — Non-obvious internals

## gfx cache (`gfx: Map<string, EntityGfx>`)
Lives inside the `useEffect` closure in `PixiStage.tsx`. Keyed by entity id.
Entries are created lazily on first snapshot appearance and destroyed when an
id disappears from `getSnapshots()`. Never cleared on re-render — the effect
only re-runs on `width`/`height` changes.

## Snapshot → rendered flow
Each `requestAnimationFrame`:
1. `getSnapshotsRef.current()` — pull latest `EntitySnapshot[]` from React state
2. For each snapshot: create or update `EntityGfx` in the cache
3. `group.position.set(s.x, s.y)` — world coords, camera offset via `worldLayer.position`
4. Stale ids → `group.destroy({ children: true })`

## Pixi v8 texture quirk
No `BaseTexture` in Pixi v8. Scale mode is set on `texture.source`:
```ts
(baseTex.source as { scaleMode: string }).scaleMode = "nearest";
```
Cast required because the type isn't exported. Omitting causes blurry
pixel-art sprites at non-1× resolution.

## Sprite vs circle fallback
If `SpriteAtlas.load()` fails, `atlas` is `null` and every archetype renders
as a coloured circle. Per-archetype colours from `ARCHETYPE_COLORS` in
`theme.ts`; radii from `ARCHETYPE_RADIUS`.

## Camera dead-zone + ease
A 30%-viewport dead zone (Zelda-style) prevents the world from sliding while
the player wanders. Camera eases toward desired position at `CAMERA_LERP = 0.18`
per frame. Bounds come from `getCameraBoundsRef`.

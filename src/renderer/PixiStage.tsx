import { Application, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { useEffect, useRef } from "react";
import type { EntitySnapshot } from "../simulation/entity";
import { ARCHETYPE_COLORS, ARCHETYPE_RADIUS } from "./theme";
import { pickAnimation, SpriteAtlas } from "./sprite-atlas";

// Animation state lives next to each entity's gfx. Sprites animate by keeping
// last-position so we can pick walk-{e,s,w,n} from movement delta, and a
// frame counter that advances on the manifest's per-anim duration.
type SpriteAnimState = {
  animName: string;
  frameIdx: number;
  lastFrameMs: number;
  lastX: number;
  lastY: number;
};

type EntityGfx = {
  body: Graphics | Sprite;
  energyBar: Graphics;
  bubble: Text;
  label: Text;
  thinking: Graphics;
  group: Container;
  /** Set when body is a Sprite (i.e. atlas had this archetype). */
  sprite?: SpriteAnimState;
};

export type CameraBounds = { x: number; y: number; w: number; h: number };

type PixiStageProps = {
  // Viewport — the canvas size on screen.
  width: number;
  height: number;
  // World — the full simulated area. Camera pans inside the worldLayer so the
  // viewport always shows a window into [0..worldWidth, 0..worldHeight].
  worldWidth: number;
  worldHeight: number;
  // If set, the camera centers on this entity each frame, clamped to the rect
  // returned by getCameraBounds. Pass null to disable camera follow.
  cameraTargetId: string | null;
  // The camera will not pan beyond this rectangle. Read each frame so it can
  // change at runtime (e.g. when the player crosses a region boundary).
  getCameraBounds: () => CameraBounds;
  getSnapshots: () => readonly EntitySnapshot[];
  getSelectedId: () => string | null;
  getThinkingIds: () => ReadonlySet<string>;
  onSelect: (id: string | null) => void;
};

// Camera tuning. Dead zone is the centered rectangle in screen coords inside
// which the camera does not pan — the player can wander freely without the
// world sliding. Ease is the per-frame fraction of the gap to the desired
// camera position; lower = smoother, higher = snappier (1.0 = instant).
const CAMERA_LERP = 0.18;
const CAMERA_DEAD_ZONE_FRAC = 0.3; // 30% of viewport in each axis

const LABEL_STYLE = new TextStyle({
  fontFamily: "ui-sans-serif, system-ui",
  fontSize: 9,
  fill: 0xcfe3ff,
});

const BUBBLE_STYLE = new TextStyle({
  fontFamily: "ui-sans-serif, system-ui",
  fontSize: 11,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3, join: "round" },
});

export function PixiStage({
  width,
  height,
  worldWidth,
  worldHeight,
  cameraTargetId,
  getCameraBounds,
  getSnapshots,
  getSelectedId,
  getThinkingIds,
  onSelect,
}: PixiStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Refs for callbacks so the effect only runs on width/height change.
  const getSnapshotsRef = useRef(getSnapshots);
  const getSelectedIdRef = useRef(getSelectedId);
  const getThinkingIdsRef = useRef(getThinkingIds);
  const onSelectRef = useRef(onSelect);
  const cameraTargetIdRef = useRef(cameraTargetId);
  const getCameraBoundsRef = useRef(getCameraBounds);
  const worldDimsRef = useRef({ w: worldWidth, h: worldHeight });
  getSnapshotsRef.current = getSnapshots;
  getSelectedIdRef.current = getSelectedId;
  getThinkingIdsRef.current = getThinkingIds;
  onSelectRef.current = onSelect;
  cameraTargetIdRef.current = cameraTargetId;
  getCameraBoundsRef.current = getCameraBounds;
  worldDimsRef.current = { w: worldWidth, h: worldHeight };

  useEffect(() => {
    let app: Application | null = null;
    let destroyed = false;
    const gfx = new Map<string, EntityGfx>();
    let atlas: SpriteAtlas | null = null;
    // worldLayer is the camera-able container. Everything in world coords —
    // bg-grid, entity groups, selection ring — lives inside it. To pan the
    // camera we mutate worldLayer.position. The viewport is the canvas itself.
    let worldLayer: Container | null = null;
    let entityLayer: Container | null = null;
    let selectionRing: Graphics | null = null;
    let rafId = 0;

    (async () => {
      app = new Application();
      await app.init({
        width,
        height,
        background: 0x0b1220,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
      });
      // Load the sprite atlas once. Failures are non-fatal: the renderer falls
      // back to coloured circles for any archetype not present in the atlas
      // (or for everything if the atlas itself is missing).
      try {
        atlas = await SpriteAtlas.load("/sprites/atlas.png", "/sprites/manifest.json");
      } catch (err) {
        console.warn("[PixiStage] sprite atlas failed to load — falling back to circles", err);
        atlas = null;
      }
      if (destroyed) {
        app.destroy(true, { children: true });
        return;
      }
      const el = mountRef.current;
      if (!el) return;
      el.appendChild(app.canvas);
      app.canvas.style.borderRadius = "8px";
      app.canvas.style.display = "block";

      worldLayer = new Container();
      app.stage.addChild(worldLayer);

      // Grid covers the full world so it pans naturally with the camera.
      const bg = new Graphics();
      const { w: wW, h: wH } = worldDimsRef.current;
      for (let x = 0; x <= wW; x += 50) bg.moveTo(x, 0).lineTo(x, wH);
      for (let y = 0; y <= wH; y += 50) bg.moveTo(0, y).lineTo(wW, y);
      bg.stroke({ color: 0x1e293b, width: 1, alpha: 0.4 });
      worldLayer.addChild(bg);

      entityLayer = new Container();
      worldLayer.addChild(entityLayer);

      selectionRing = new Graphics();
      worldLayer.addChild(selectionRing);

      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointerdown", (event) => {
        if (event.target === app!.stage) onSelectRef.current(null);
      });

      const render = () => {
        if (destroyed || !app || !entityLayer || !selectionRing || !worldLayer) return;
        const snaps = getSnapshotsRef.current();
        const selectedId = getSelectedIdRef.current();
        const thinkingIds = getThinkingIdsRef.current();
        const seen = new Set<string>();
        const now = performance.now();

        // Camera with dead zone + ease.
        //   1. The dead zone is a centered rectangle in screen coords. While
        //      the player's screen position stays inside it, the camera
        //      doesn't move at all — Zelda-style "exploration zone."
        //   2. Once the player crosses a dead-zone edge, the desired camera
        //      pins the player to that edge (so further movement scrolls).
        //   3. The result is clamped to world edges so we never reveal the
        //      void beyond [0..worldW, 0..worldH].
        //   4. Finally we ease the actual camera toward the desired one each
        //      frame instead of snapping — gives a smooth trailing feel.
        const targetId = cameraTargetIdRef.current;
        if (targetId) {
          const target = snaps.find((s) => s.id === targetId);
          if (target) {
            const cb = getCameraBoundsRef.current();
            const cx = worldLayer.position.x;
            const cy = worldLayer.position.y;
            // Player screen-position with current camera.
            const psx = target.x + cx;
            const psy = target.y + cy;
            // Dead zone in screen coords (centered on viewport).
            const dzW = width * CAMERA_DEAD_ZONE_FRAC;
            const dzH = height * CAMERA_DEAD_ZONE_FRAC;
            const dzL = (width - dzW) / 2;
            const dzR = (width + dzW) / 2;
            const dzT = (height - dzH) / 2;
            const dzB = (height + dzH) / 2;
            // Desired cam: keep cx/cy unless the player has crossed a dead-
            // zone edge, in which case pin them to that edge.
            let desX = cx;
            let desY = cy;
            if (psx < dzL) desX = dzL - target.x;
            else if (psx > dzR) desX = dzR - target.x;
            if (psy < dzT) desY = dzT - target.y;
            else if (psy > dzB) desY = dzB - target.y;
            // Clamp to camera-bounds rect (active region or whole world).
            // When the rect is smaller than the viewport on an axis, centre
            // it on that axis instead of clamping (avoids inverted ranges).
            if (cb.w >= width) {
              desX = Math.max(width - (cb.x + cb.w), Math.min(-cb.x, desX));
            } else {
              desX = (width - cb.w) / 2 - cb.x;
            }
            if (cb.h >= height) {
              desY = Math.max(height - (cb.y + cb.h), Math.min(-cb.y, desY));
            } else {
              desY = (height - cb.h) / 2 - cb.y;
            }
            // Ease toward the clamped target.
            worldLayer.position.set(
              cx + (desX - cx) * CAMERA_LERP,
              cy + (desY - cy) * CAMERA_LERP,
            );
          }
        }

        for (const s of snaps) {
          seen.add(s.id);
          let g = gfx.get(s.id);
          if (!g) {
            const id = s.id;
            const r = ARCHETYPE_RADIUS[s.archetype];

            // Sprite path: atlas has this archetype → animated LPC sprite.
            // Fallback: coloured circle (synthetic look used before sprites).
            let body: Graphics | Sprite;
            let spriteState: SpriteAnimState | undefined;
            if (atlas && atlas.hasCharacter(s.archetype)) {
              const tex = atlas.frameTexture(s.archetype, "idle", 0)!;
              const sprite = new Sprite(tex);
              // Anchor near the bottom so the entity's (x, y) corresponds to
              // the character's feet — natural for top-down placement.
              sprite.anchor.set(0.5, 0.85);
              body = sprite;
              spriteState = {
                animName: "idle",
                frameIdx: 0,
                lastFrameMs: now,
                lastX: s.x,
                lastY: s.y,
              };
            } else {
              const color = ARCHETYPE_COLORS[s.archetype];
              const circle = new Graphics();
              circle.circle(0, 0, r).fill({ color });
              circle.stroke({ color: 0x0f172a, width: 1 });
              body = circle;
            }

            body.eventMode = "static";
            body.cursor = "pointer";
            body.on("pointerdown", (ev) => {
              ev.stopPropagation();
              onSelectRef.current(id);
            });

            const energyBar = new Graphics();
            const label = new Text({ text: s.name, style: LABEL_STYLE });
            label.anchor.set(0.5, 0);
            label.alpha = 0.6;

            const bubble = new Text({ text: "", style: BUBBLE_STYLE });
            bubble.anchor.set(0.5, 1);
            bubble.visible = false;

            const thinking = new Graphics();
            thinking.visible = false;

            const group = new Container();
            group.addChild(body);
            group.addChild(energyBar);
            group.addChild(label);
            group.addChild(bubble);
            group.addChild(thinking);
            entityLayer.addChild(group);

            g = { body, energyBar, bubble, label, thinking, group, sprite: spriteState };
            gfx.set(s.id, g);
          }
          g.group.position.set(s.x, s.y);

          // Sprite animation: pick anim from movement delta, advance frame on
          // the manifest's per-anim duration. Sprites use a different vertical
          // offset from circles, so the energy bar / label use a sprite-aware
          // baseline below.
          if (g.sprite && atlas && g.body instanceof Sprite) {
            const ss = g.sprite;
            const dx = s.x - ss.lastX;
            const dy = s.y - ss.lastY;
            const desired = pickAnimation(dx, dy);
            const anim = atlas.animation(desired);
            if (anim) {
              if (desired !== ss.animName) {
                ss.animName = desired;
                ss.frameIdx = 0;
                ss.lastFrameMs = now;
              } else if (now - ss.lastFrameMs >= anim.frameDurationMs) {
                const advance = Math.floor((now - ss.lastFrameMs) / anim.frameDurationMs);
                ss.frameIdx = (ss.frameIdx + advance) % anim.frames;
                ss.lastFrameMs = now;
              }
              const tex = atlas.frameTexture(s.archetype, ss.animName, ss.frameIdx);
              if (tex) g.body.texture = tex;
            }
            ss.lastX = s.x;
            ss.lastY = s.y;
          }

          // UI overlays sit relative to the character's visual bottom. For a
          // 32px sprite anchored at (0.5, 0.85) the feet are ~5px below
          // origin; for circles use the legacy radius-based offset.
          const isSprite = g.body instanceof Sprite;
          const overlayBaseY = isSprite ? 6 : ARCHETYPE_RADIUS[s.archetype] + 3;
          const labelY = isSprite ? 10 : ARCHETYPE_RADIUS[s.archetype] + 7;

          g.energyBar.clear();
          const barW = 14;
          g.energyBar.rect(-barW / 2, overlayBaseY, barW, 2).fill({ color: 0x334155 });
          g.energyBar.rect(-barW / 2, overlayBaseY, barW * s.energy, 2).fill({ color: 0x34d399 });

          g.label.position.set(0, labelY);
          if (g.label.text !== s.name) g.label.text = s.name;

          // Speech-bubble / thinking indicator anchor: above the head. For
          // sprites that's roughly -28 above the entity origin (sprite stands
          // 32 px tall and is anchored 0.85 from the top); for circles it's
          // the negated radius.
          const headTopY = isSprite ? -28 : -ARCHETYPE_RADIUS[s.archetype] - 6;

          if (s.speechBubble) {
            if (g.bubble.text !== s.speechBubble) g.bubble.text = s.speechBubble;
            g.bubble.position.set(0, headTopY);
            g.bubble.visible = true;
          } else {
            g.bubble.visible = false;
          }

          // T3 "thinking" indicator: a pulsing purple dot above the entity.
          if (thinkingIds.has(s.id)) {
            g.thinking.visible = true;
            g.thinking.clear();
            const pulse = 0.6 + 0.4 * Math.abs(Math.sin(now / 250));
            const ty = headTopY - 8;
            g.thinking.circle(0, ty, 2.5).fill({ color: 0xa855f7, alpha: pulse });
            g.thinking.circle(5, ty, 2).fill({ color: 0xa855f7, alpha: pulse * 0.7 });
            g.thinking.circle(-5, ty, 2).fill({ color: 0xa855f7, alpha: pulse * 0.7 });
          } else if (g.thinking.visible) {
            g.thinking.visible = false;
            g.thinking.clear();
          }
        }

        for (const [id, g] of gfx) {
          if (!seen.has(id)) {
            g.group.destroy({ children: true });
            gfx.delete(id);
          }
        }

        selectionRing.clear();
        if (selectedId) {
          const sel = snaps.find((s) => s.id === selectedId);
          if (sel) {
            const selGfx = gfx.get(sel.id);
            const isSprite = selGfx?.body instanceof Sprite;
            const radius = isSprite ? 14 : ARCHETYPE_RADIUS[sel.archetype] + 4;
            selectionRing
              .circle(sel.x, sel.y, radius)
              .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
          }
        }

        rafId = requestAnimationFrame(render);
      };
      rafId = requestAnimationFrame(render);
    })();

    return () => {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (app) {
        try {
          app.destroy(true, { children: true });
        } catch {
          // ignore
        }
      }
      gfx.clear();
    };
  }, [width, height]);

  return <div ref={mountRef} />;
}

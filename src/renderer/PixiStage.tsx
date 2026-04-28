import { Application, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { useEffect, useRef } from "react";
import type { EntitySnapshot } from "../simulation/entity";
import { ARCHETYPE_COLORS, ARCHETYPE_RADIUS } from "./theme";
import { getAnimationFrame, pickAnimation, SpriteAtlas } from "./sprite-atlas";
import { footstepSound, type SurfaceType } from "../sound/FootstepSound";

// ── Palette helpers ──────────────────────────────────────────────

function hashId(id: string): number {
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) + hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function hslToHex(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

function shiftHue(hexColor: number, shiftDeg: number): number {
  const r = (hexColor >> 16) & 0xff;
  const g = (hexColor >> 8) & 0xff;
  const b = hexColor & 0xff;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255 * 100;
  if (max !== min) {
    const d = max - min;
    const s = l > 50 ? d / (510 - max - min) * 100 : d / (max + min) * 100;
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    return hslToHex(((h + shiftDeg) % 360 + 360) % 360, s, l);
  }
  return hexColor;
}

function groundTileColor(tileCol: number, tileRow: number): { color: number; alpha: number } {
  const palette: Array<[number, number]> = [
    [0x4a7c3f, 0.65], // grass
    [0x8b7355, 0.7],  // dirt
    [0xc4a86a, 0.6],  // path
    [0x7a7a7a, 0.55], // stone
  ];
  const h = (tileCol * 7 + tileRow * 13 + 3) % 11;
  const idx = Math.abs(h) % palette.length;
  return { color: palette[idx][0], alpha: palette[idx][1] };
}

// Animation state lives next to each entity's gfx. Sprites animate by keeping
// last-position so we can pick walk-{e,s,w,n} from movement delta, and a
// frame counter that advances on the manifest's per-anim duration.
type SpriteAnimState = {
  animName: string;
  frameIdx: number;
  prevFrameIdx: number;
  lastFrameMs: number;
  lastX: number;
  lastY: number;
  prevDirectionProposal: string;
  directionLockTicks: number;
};

type EntityGfx = {
  body: Graphics | Sprite;
  energyBar: Graphics;
  bubble: Text;
  bubbleBg: Graphics;
  label: Text;
  thinking: Graphics;
  shadow: Graphics;
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
  // (#15) Camera shake: called each frame to check for a scenario broadcast flash.
  getBroadcastFlash: () => { color: number; expiresAtTick: number } | undefined;
  // (#37) Hover-to-peek: fires with the entity id when pointer enters a sprite,
  // null when it leaves.
  onHover: (id: string | null) => void;
  // (#46) Radius around the player within which non-player entities show an
  // in-range glow ring.
  interactRadius: number;
};

// Camera tuning. Dead zone is the centered rectangle in screen coords inside
// which the camera does not pan — the player can wander freely without the
// world sliding. Ease is the per-frame fraction of the gap to the desired
// camera position; lower = smoother, higher = snappier (1.0 = instant).
const CAMERA_LERP = 0.18;
const CAMERA_DEAD_ZONE_FRAC = 0.3; // 30% of viewport in each axis

// Camera shake tuning. Duration (ms) of shake after a broadcastFlash event.
const SHAKE_DURATION_MS = 200;
// Peak amplitude (px) at the moment the shake starts; decays linearly to 0.
const SHAKE_AMPLITUDE_PX = 4;

const LABEL_STYLE = new TextStyle({
  fontFamily: "ui-sans-serif, system-ui",
  fontSize: 9,
  fill: 0xcfe3ff,
});

const BUBBLE_STYLE = new TextStyle({
  fontFamily: "ui-sans-serif, system-ui",
  fontSize: 11,
  fill: 0xffffff,
  wordWrap: true,
  wordWrapWidth: 110,
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
  getBroadcastFlash,
  onHover,
  interactRadius,
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
  const getBroadcastFlashRef = useRef(getBroadcastFlash);
  const onHoverRef = useRef(onHover);
  const interactRadiusRef = useRef(interactRadius);
  getSnapshotsRef.current = getSnapshots;
  getSelectedIdRef.current = getSelectedId;
  getThinkingIdsRef.current = getThinkingIds;
  onSelectRef.current = onSelect;
  cameraTargetIdRef.current = cameraTargetId;
  getCameraBoundsRef.current = getCameraBounds;
  worldDimsRef.current = { w: worldWidth, h: worldHeight };
  getBroadcastFlashRef.current = getBroadcastFlash;
  onHoverRef.current = onHover;
  interactRadiusRef.current = interactRadius;

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
    let inRangeRings: Graphics | null = null;
    let selectionRing: Graphics | null = null;
    let groundGraphics: Graphics | null = null;
    let dayNightOverlay: Graphics | null = null;
    let rafId = 0;

    // (#15) Camera shake state. Managed inside the render closure.
    let shakeUntilMs = 0;
    let lastFlashExpiresAt = -1;

    // (#6) Lerped display positions for smooth movement between sim ticks.
    const displayPositions = new Map<string, { x: number; y: number }>();

    const surfaceAt = (x: number, y: number): SurfaceType => {
      const h = Math.floor(x / 200) + Math.floor(y / 200);
      const surfaces: SurfaceType[] = [
        "grass", "grass", "dirt", "stone",
        "grass", "wood", "dirt", "grass",
      ];
      return surfaces[Math.abs(h) % surfaces.length];
    };

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

      // Ground tiles (earthy pattern) — render behind grid.
      groundGraphics = new Graphics();
      const { w: wW, h: wH } = worldDimsRef.current;
      for (let tx = 0; tx < wW; tx += 64) {
        for (let ty = 0; ty < wH; ty += 64) {
          const tileCol = Math.floor(tx / 64);
          const tileRow = Math.floor(ty / 64);
          const t = groundTileColor(tileCol, tileRow);
          groundGraphics.rect(tx, ty, 64, 64).fill({ color: t.color, alpha: t.alpha });
        }
      }
      worldLayer.addChild(groundGraphics);

      // Grid covers the full world so it pans naturally with the camera.
      const bg = new Graphics();
      for (let x = 0; x <= wW; x += 50) bg.moveTo(x, 0).lineTo(x, wH);
      for (let y = 0; y <= wH; y += 50) bg.moveTo(0, y).lineTo(wW, y);
      bg.stroke({ color: 0x1e293b, width: 1, alpha: 0.4 });
      worldLayer.addChild(bg);

      entityLayer = new Container();
      entityLayer.sortableChildren = true;
      worldLayer.addChild(entityLayer);

      // (#46) In-range glow rings sit below the selection ring so they never
      // occlude the active selection indicator.
      inRangeRings = new Graphics();
      worldLayer.addChild(inRangeRings);

      selectionRing = new Graphics();
      worldLayer.addChild(selectionRing);

      // Day/night overlay sits on top of everything, screen-fixed.
      dayNightOverlay = new Graphics();
      app.stage.addChild(dayNightOverlay);

      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointerdown", (event) => {
        if (event.target === app!.stage) onSelectRef.current(null);
      });

      const render = () => {
        if (destroyed || !app || !entityLayer || !selectionRing || !worldLayer || !inRangeRings || !dayNightOverlay) return;
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

        // (#15) Camera shake: triggered by broadcastFlash. Each time we see a
        // new expiresAtTick value we start a fresh SHAKE_DURATION_MS burst.
        // Amplitude decays linearly to zero so the shake smoothly settles.
        const flash = getBroadcastFlashRef.current();
        if (flash && flash.expiresAtTick !== lastFlashExpiresAt) {
          lastFlashExpiresAt = flash.expiresAtTick;
          shakeUntilMs = now + SHAKE_DURATION_MS;
        }
        if (now < shakeUntilMs) {
          const decay = (shakeUntilMs - now) / SHAKE_DURATION_MS;
          const sx = (Math.random() - 0.5) * SHAKE_AMPLITUDE_PX * 2 * decay;
          const sy = (Math.random() - 0.5) * SHAKE_AMPLITUDE_PX * 2 * decay;
          worldLayer.position.x += sx;
          worldLayer.position.y += sy;
        }

        const lerpFactor = 0.25;
        for (const s of snaps) {
          const cur = displayPositions.get(s.id);
          if (!cur) {
            displayPositions.set(s.id, { x: s.x, y: s.y });
          } else {
            cur.x += (s.x - cur.x) * lerpFactor;
            cur.y += (s.y - cur.y) * lerpFactor;
          }
        }

        for (const s of snaps) {
          seen.add(s.id);
          let g = gfx.get(s.id);
          if (!g) {
            const id = s.id;
            const r = ARCHETYPE_RADIUS[s.archetype];

            // Palette variation: shift hue based on entity ID hash.
            const paletteShift = (hashId(s.id) % 360) - 180; // -180 to +180

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
              sprite.tint = shiftHue(ARCHETYPE_COLORS[s.archetype] ?? 0x94a3b8, paletteShift);
              body = sprite;
              spriteState = {
                animName: "idle",
                frameIdx: 0,
                prevFrameIdx: 0,
                lastFrameMs: now,
                lastX: s.x,
                lastY: s.y,
                prevDirectionProposal: "idle",
                directionLockTicks: 0,
              };
            } else {
              const baseColor = ARCHETYPE_COLORS[s.archetype] ?? 0x94a3b8;
              const circle = new Graphics();
              circle.circle(0, 0, r).fill({ color: shiftHue(baseColor, paletteShift) });
              circle.stroke({ color: 0x0f172a, width: 1 });
              body = circle;
            }

            body.eventMode = "static";
            body.cursor = "pointer";
            body.on("pointerdown", (ev) => {
              ev.stopPropagation();
              onSelectRef.current(id);
            });
            // (#37) Hover-to-peek: notify App of which entity the pointer is
            // over so a name/archetype tooltip can be rendered in React.
            body.on("pointerover", () => onHoverRef.current(id));
            body.on("pointerout", () => onHoverRef.current(null));

            const energyBar = new Graphics();
            const label = new Text({ text: s.name, style: LABEL_STYLE });
            label.anchor.set(0.5, 0);
            label.alpha = 0.6;

            const bubble = new Text({ text: "", style: BUBBLE_STYLE });
            bubble.anchor.set(0.5, 1);
            bubble.visible = false;

            const bubbleBg = new Graphics();
            bubbleBg.visible = false;

            const thinking = new Graphics();
            thinking.visible = false;

            // Shadow ellipse beneath the entity.
            const shadow = new Graphics();
            shadow.ellipse(0, 4, 10, 4).fill({ color: 0x000000, alpha: 0.2 });

            const group = new Container();
            group.addChild(shadow);
            group.addChild(body);
            group.addChild(energyBar);
            group.addChild(label);
            group.addChild(bubbleBg);
            group.addChild(bubble);
            group.addChild(thinking);
            entityLayer.addChild(group);

            g = { body, energyBar, bubble, bubbleBg, label, thinking, shadow, group, sprite: spriteState };
            gfx.set(s.id, g);
          }
          const dp = displayPositions.get(s.id);
          g.group.position.set(dp ? dp.x : s.x, dp ? dp.y : s.y);
          g.group.zIndex = dp ? dp.y : s.y;

          // Sprite animation with hysteresis + footstep detection.
          if (g.sprite && atlas && g.body instanceof Sprite) {
            const ss = g.sprite;
            const dx = s.x - ss.lastX;
            const dy = s.y - ss.lastY;
            const raw = pickAnimation(dx, dy);

            // Hysteresis: only switch direction when pickAnimation returns the
            // same value for 3+ consecutive frames.
            let lockedDirection = ss.animName;
            let directionChanged = false;
            if (raw === ss.prevDirectionProposal) {
              if (ss.directionLockTicks < 3) ss.directionLockTicks++;
              if (ss.directionLockTicks >= 3 && raw !== ss.animName) {
                lockedDirection = raw;
                directionChanged = true;
                ss.directionLockTicks = 0;
              }
            } else {
              ss.prevDirectionProposal = raw;
              ss.directionLockTicks = 0;
            }

            const anim = atlas.animation(lockedDirection);
            if (anim) {
              ss.prevFrameIdx = ss.frameIdx;

              if (directionChanged || lockedDirection !== ss.animName) {
                ss.animName = lockedDirection;
                ss.frameIdx = 0;
                ss.lastFrameMs = now;
              } else if (now - ss.lastFrameMs >= anim.frameDurationMs) {
                const advance = Math.floor(
                  (now - ss.lastFrameMs) / anim.frameDurationMs,
                );
                ss.frameIdx = (ss.frameIdx + advance) % anim.frames;
                ss.lastFrameMs = now;
              }

              const effectiveFrame = getAnimationFrame(
                ss.animName,
                lockedDirection,
                ss.frameIdx,
                directionChanged,
              );
              const tex = atlas.frameTexture(s.archetype, ss.animName, effectiveFrame);
              if (tex) g.body.texture = tex;

              // Footstep sound: play on foot-down frames of walk animation.
              if (
                ss.prevFrameIdx !== ss.frameIdx &&
                ss.animName.startsWith("walk-")
              ) {
                const footDownFrames = new Set([
                  0,
                  Math.floor(anim.frames / 2),
                ]);
                if (footDownFrames.has(ss.frameIdx)) {
                  const camX = -worldLayer.position.x + width / 2;
                  const camY = -worldLayer.position.y + height / 2;
                  const dist = Math.hypot(s.x - camX, s.y - camY);
                  const vol =
                    Math.max(0, Math.min(1, 1 - dist / 600)) * 0.35;
                  footstepSound.play(surfaceAt(s.x, s.y), vol);
                }
              }
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
            // Draw bubble background + tail
            g.bubbleBg.clear();
            const tw = g.bubble.width;
            const th = g.bubble.height;
            const padX = 6;
            const padY = 4;
            const radius = 6;
            const bx = -tw / 2 - padX;
            const by = headTopY - th - padY;
            const bw = tw + padX * 2;
            const bh = th + padY * 2;
            // Archetype-based fill color, darkened to 25 %
            const rawColor = ARCHETYPE_COLORS[s.archetype] ?? 0x94a3b8;
            const rr = ((rawColor >> 16) & 0xff) * 0.25;
            const gg = ((rawColor >> 8) & 0xff) * 0.25;
            const bb = (rawColor & 0xff) * 0.25;
            const darkColor = (Math.floor(rr) << 16) | (Math.floor(gg) << 8) | Math.floor(bb);
            g.bubbleBg.roundRect(bx, by, bw, bh, radius).fill({ color: darkColor, alpha: 0.9 });
            g.bubbleBg.stroke({ color: 0xffffff, width: 0.5, alpha: 0.3 });
            // Triangle tail pointing down
            g.bubbleBg.moveTo(-5, by + bh);
            g.bubbleBg.lineTo(5, by + bh);
            g.bubbleBg.lineTo(0, by + bh + 7);
            g.bubbleBg.closePath();
            g.bubbleBg.fill({ color: darkColor, alpha: 0.9 });
            g.bubbleBg.visible = true;
          } else {
            g.bubble.visible = false;
            if (g.bubbleBg) g.bubbleBg.visible = false;
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

        // Day/night cycle overlay — full-screen tint that cycles every 2 min.
        const DAY_CYCLE_MS = 120_000;
        const dayPhase = (performance.now() % DAY_CYCLE_MS) / DAY_CYCLE_MS;
        // 0.0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk
        let nightAlpha = 0;
        let nightColor = 0x0b1220;
        if (dayPhase < 0.1 || dayPhase > 0.9) { nightAlpha = 0.5; nightColor = 0x0b1220; }
        else if (dayPhase < 0.2) { const t = (dayPhase - 0.1) / 0.1; nightAlpha = 0.5 * (1 - t); }
        else if (dayPhase > 0.8) { const t = (dayPhase - 0.8) / 0.1; nightAlpha = 0.5 * t; }
        let overlayColor = nightColor;
        if (dayPhase > 0.15 && dayPhase < 0.25) { overlayColor = 0xcc7700; nightAlpha = Math.max(nightAlpha, 0.15); }
        else if (dayPhase > 0.75 && dayPhase < 0.85) { overlayColor = 0x8822aa; nightAlpha = Math.max(nightAlpha, 0.2); }
        dayNightOverlay.clear();
        dayNightOverlay.rect(0, 0, width, height).fill({ color: overlayColor, alpha: nightAlpha * 0.6 });

        for (const [id, g] of gfx) {
          if (!seen.has(id)) {
            g.group.destroy({ children: true });
            gfx.delete(id);
            displayPositions.delete(id);
          }
        }

        // (#46) In-range indicator. Uses display positions for visual tracking.
        inRangeRings.clear();
        const playerSnap = snaps.find((s) => s.archetype === "Player");
        if (playerSnap) {
          const ir = interactRadiusRef.current;
          const ir2 = ir * ir;
          for (const s of snaps) {
            if (s.archetype === "Player") continue;
            // Use snapshot positions for the actual distance check.
            const dx = s.x - playerSnap.x;
            const dy = s.y - playerSnap.y;
            if (dx * dx + dy * dy <= ir2) {
              const eGfx = gfx.get(s.id);
              const eIsSprite = eGfx?.body instanceof Sprite;
              const ringR = (eIsSprite ? 14 : ARCHETYPE_RADIUS[s.archetype] + 4) + 4;
              // Render ring at display position so it tracks lerped entity.
              const edp = displayPositions.get(s.id);
              const rx = edp ? edp.x : s.x;
              const ry = edp ? edp.y : s.y;
              inRangeRings
                .circle(rx, ry, ringR)
                .stroke({ color: 0x22d3ee, width: 1.5, alpha: 0.35 });
            }
          }
        }

        selectionRing.clear();
        if (selectedId) {
          const sel = snaps.find((s) => s.id === selectedId);
          if (sel) {
            const selGfx = gfx.get(sel.id);
            const isSprite = selGfx?.body instanceof Sprite;
            const radius = isSprite ? 14 : ARCHETYPE_RADIUS[sel.archetype] + 4;
            const sdp = displayPositions.get(sel.id);
            const sx = sdp ? sdp.x : sel.x;
            const sy = sdp ? sdp.y : sel.y;
            selectionRing
              .circle(sx, sy, radius)
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

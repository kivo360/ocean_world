import { useEffect, useRef } from "react";
import type { EntitySnapshot, Archetype } from "../simulation/entity";
import type { Region } from "../simulation/regions";
import { ARCHETYPE_COLORS } from "../renderer/theme";

type MinimapProps = {
  entities: readonly EntitySnapshot[];
  regions: Region[];
  worldWidth: number;
  worldHeight: number;
  viewportBounds: { x: number; y: number; width: number; height: number };
};

const MAP_W = 180;
const MAP_H = 120;

function numToHex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function Minimap({
  entities,
  regions,
  worldWidth,
  worldHeight,
  viewportBounds,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scaleX = MAP_W / worldWidth;
    const scaleY = MAP_H / worldHeight;

    ctx.fillStyle = "#1a3a1a";
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 0.5;
    for (const region of regions) {
      const b = region.bounds;
      ctx.strokeRect(b.x * scaleX, b.y * scaleY, b.w * scaleX, b.h * scaleY);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      viewportBounds.x * scaleX,
      viewportBounds.y * scaleY,
      viewportBounds.width * scaleX,
      viewportBounds.height * scaleY,
    );

    for (const e of entities) {
      if (e.archetype === "Player") continue;
      const raw = ARCHETYPE_COLORS[e.archetype as Archetype];
      ctx.fillStyle = raw !== undefined ? numToHex(raw) : "#94a3b8";
      ctx.fillRect(e.x * scaleX - 1, e.y * scaleY - 1, 2, 2);
    }

    const player = entities.find((e) => e.archetype === "Player");
    if (player) {
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(player.x * scaleX - 2, player.y * scaleY - 2, 4, 4);
    }
  }, [entities, regions, worldWidth, worldHeight, viewportBounds]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        width: MAP_W,
        height: MAP_H,
        border: "1px solid #334155",
        borderRadius: 6,
        background: "#0f172a",
        overflow: "hidden",
      }}
    >
      <canvas ref={canvasRef} width={MAP_W} height={MAP_H} />
      <div
        style={{
          position: "absolute",
          top: 3,
          left: 4,
          fontSize: 8,
          color: "#64748b",
          letterSpacing: 1,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        MAP
      </div>
    </div>
  );
}

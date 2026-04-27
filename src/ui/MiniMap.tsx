import { useEffect, useRef } from "react";
import { ARCHETYPE_COLORS } from "../renderer/theme";
import { PLAYER_ID } from "../simulation/archetypes";
import type { EntitySnapshot } from "../simulation/entity";

const MAP_WIDTH = 150;
const MAP_HEIGHT = 100;
const DOT_RADIUS = 1.5;
const PLAYER_DOT_RADIUS = 2.5;

// Subtle region grid: 3 columns × 2 rows
const REGION_COLS = 3;
const REGION_ROWS = 2;

function hexToCSS(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

export function MiniMap({
  getSnapshots,
  worldWidth,
  worldHeight,
}: {
  getSnapshots: () => readonly EntitySnapshot[];
  worldWidth: number;
  worldHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

      ctx.strokeStyle = "rgba(30, 41, 59, 0.9)";
      ctx.lineWidth = 0.5;
      for (let c = 1; c < REGION_COLS; c++) {
        const x = Math.round((MAP_WIDTH / REGION_COLS) * c) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, MAP_HEIGHT);
        ctx.stroke();
      }
      for (let r = 1; r < REGION_ROWS; r++) {
        const y = Math.round((MAP_HEIGHT / REGION_ROWS) * r) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(MAP_WIDTH, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, MAP_WIDTH - 1, MAP_HEIGHT - 1);

      const snaps = getSnapshots();
      for (const s of snaps) {
        const sx = (s.x / worldWidth) * MAP_WIDTH;
        const sy = (s.y / worldHeight) * MAP_HEIGHT;
        const isPlayer = s.id === PLAYER_ID;

        if (isPlayer) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = "#f8fafc";
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(sx, sy, PLAYER_DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
        } else {
          ctx.fillStyle = hexToCSS(ARCHETYPE_COLORS[s.archetype]);
          ctx.beginPath();
          ctx.arc(sx, sy, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [getSnapshots, worldWidth, worldHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        borderRadius: 6,
        border: "1px solid #1e293b",
        zIndex: 10,
        display: "block",
      }}
    />
  );
}

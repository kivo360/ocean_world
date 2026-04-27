// Top-of-stage banner + brief tinted flash announcing scenario events.
// Reads `world.activeScenario` and `world.broadcastFlash` directly each
// render — both lifecycles are managed by the simulation.

import type { World } from "../simulation/world";

type ScenarioOverlayProps = {
  world: World;
  width: number;
  height: number;
};

const NAME_COLOR: Record<string, string> = {
  market_crash: "#fbbf24",
  riot: "#f87171",
  festival: "#34d399",
  plague: "#a855f7",
};

function hex(num: number): string {
  return `#${num.toString(16).padStart(6, "0")}`;
}

export function ScenarioOverlay({ world, width, height }: ScenarioOverlayProps) {
  const scenario = world.activeScenario;
  const flash = world.broadcastFlash;
  const flashActive = flash && flash.expiresAtTick >= world.tick;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        pointerEvents: "none",
        overflow: "hidden",
        borderRadius: 8,
      }}
    >
      {flashActive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: hex(flash.color),
            opacity: 0.18,
            transition: "opacity 250ms ease-out",
          }}
        />
      )}
      {scenario && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(15, 23, 42, 0.92)",
            border: `1px solid ${NAME_COLOR[scenario.name] ?? "#3b82f6"}`,
            borderRadius: 8,
            padding: "8px 16px",
            color: "#cfe3ff",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: NAME_COLOR[scenario.name] ?? "#3b82f6",
              boxShadow: `0 0 12px ${NAME_COLOR[scenario.name] ?? "#3b82f6"}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600, textTransform: "capitalize" }}>
            {scenario.name.replace("_", " ")}
          </span>
          <span style={{ opacity: 0.75 }}>{scenario.message}</span>
          <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 8 }}>
            t{scenario.startedAtTick}
          </span>
        </div>
      )}
    </div>
  );
}

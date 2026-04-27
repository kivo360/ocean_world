import type { Entity } from "../simulation/entity";

export type InteractionChoice = "talk" | "inspect" | "close";

const CHOICES: Array<{ key: string; choice: InteractionChoice; label: string }> = [
  { key: "1", choice: "talk", label: "Talk" },
  { key: "2", choice: "inspect", label: "Inspect" },
  { key: "Esc", choice: "close", label: "Walk away" },
];

export function InteractionMenu({
  target,
  screenX,
  screenY,
  onChoose,
}: {
  target: Entity;
  // Top-left of the canvas, used to anchor the menu near the target's screen
  // position. The menu floats above the canvas via absolute positioning.
  screenX: number;
  screenY: number;
  onChoose: (choice: InteractionChoice) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: screenX,
        top: screenY,
        transform: "translate(-50%, -100%)",
        background: "rgba(15, 23, 42, 0.96)",
        border: "1px solid #3b82f6",
        borderRadius: 8,
        padding: 8,
        minWidth: 180,
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.5)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#94a3b8",
          padding: "2px 4px 6px",
          borderBottom: "1px solid #1e293b",
          marginBottom: 4,
        }}
      >
        {target.name}{" "}
        <span style={{ opacity: 0.6 }}>({target.archetype})</span>
      </div>
      {CHOICES.map((c) => (
        <button
          key={c.choice}
          onClick={() => onChoose(c.choice)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            padding: "6px 8px",
            background: "transparent",
            border: 0,
            color: "#cfe3ff",
            cursor: "pointer",
            fontSize: 12,
            borderRadius: 4,
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#1e293b")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span>{c.label}</span>
          <kbd
            style={{
              fontSize: 10,
              padding: "1px 5px",
              background: "#0b1220",
              border: "1px solid #334155",
              borderRadius: 3,
              color: "#94a3b8",
            }}
          >
            {c.key}
          </kbd>
        </button>
      ))}
    </div>
  );
}

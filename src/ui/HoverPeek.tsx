type HoverPeekProps = {
  name: string;
  archetype: string;
  mouseX: number;
  mouseY: number;
};

export function HoverPeek({ name, archetype, mouseX, mouseY }: HoverPeekProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: mouseX,
        top: mouseY,
        transform: "translate(-50%, calc(-100% - 8px))",
        background: "rgba(11, 18, 32, 0.92)",
        border: "1px solid #334155",
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: 11,
        color: "#cfe3ff",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
        zIndex: 10,
      }}
    >
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ opacity: 0.55, marginLeft: 5 }}>{archetype}</span>
    </div>
  );
}

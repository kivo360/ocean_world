type ControlsProps = {
  playing: boolean;
  speed: number;
  tick: number;
  entityCount: number;
  t3Stats: { pending: number; resolved: number; inFlight: boolean };
  t3Live: boolean;
  t3Enabled: boolean;
  onPlayPause: () => void;
  onStep: () => void;
  onSpeed: (s: number) => void;
  onReset: () => void;
  onToggleT3: () => void;
};

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#1e293b",
  color: "#cfe3ff",
  border: "1px solid #334155",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};

export function Controls(props: ControlsProps) {
  const { t3Stats } = props;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "8px 12px",
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: 8,
        flexWrap: "wrap",
      }}
    >
      <button style={btnStyle} onClick={props.onPlayPause}>
        {props.playing ? "Pause" : "Play"}
      </button>
      <button style={btnStyle} onClick={props.onStep} disabled={props.playing}>
        Step
      </button>
      <button style={btnStyle} onClick={props.onReset}>
        Reset
      </button>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Speed</span>
        {[1, 2, 5, 10].map((s) => (
          <button
            key={s}
            style={{
              ...btnStyle,
              background: props.speed === s ? "#2563eb" : btnStyle.background,
              borderColor: props.speed === s ? "#3b82f6" : "#334155",
            }}
            onClick={() => props.onSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </span>

      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
        <button
          style={{
            ...btnStyle,
            background: props.t3Enabled ? "#9333ea" : btnStyle.background,
            borderColor: props.t3Enabled ? "#a855f7" : "#334155",
          }}
          onClick={props.onToggleT3}
          title="Toggle T3 LLM-based deliberation for ambient decisions"
        >
          T3 {props.t3Enabled ? "on" : "off"}
        </button>
        <span style={{ fontSize: 11, opacity: 0.7 }}>
          {props.t3Live ? "live" : "stub"} · pending {t3Stats.pending} · resolved{" "}
          {t3Stats.resolved}
          {t3Stats.inFlight ? " · in-flight" : ""}
        </span>
      </span>

      <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>
        tick {props.tick} · {props.entityCount} entities
      </span>
    </div>
  );
}

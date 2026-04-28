type TimeHudProps = {
  tick: number;
};

const TICKS_PER_DAY = 240;
const START_DAY = 1;

function parseGameTime(tick: number): { day: number; hour: number; minute: number } {
  const day = Math.floor(tick / TICKS_PER_DAY) + START_DAY;
  const ticksInDay = tick % TICKS_PER_DAY;
  const hour = Math.floor(ticksInDay / 10);
  const minute = Math.floor((ticksInDay % 10) * 6);
  return { day, hour, minute };
}

function gradientForHour(hour: number): React.CSSProperties {
  if (hour >= 6 && hour < 8) {
    return {
      backgroundImage: "linear-gradient(135deg, rgba(251,191,36,0.35), transparent)",
      backgroundColor: "rgba(15, 23, 42, 0.8)",
    };
  }
  if (hour >= 18 && hour < 20) {
    return {
      backgroundImage: "linear-gradient(135deg, rgba(109,40,217,0.35), transparent)",
      backgroundColor: "rgba(15, 23, 42, 0.8)",
    };
  }
  if (hour >= 20 || hour < 6) {
    return { backgroundColor: "rgba(8, 12, 30, 0.9)" };
  }
  return { backgroundColor: "rgba(15, 23, 42, 0.8)" };
}

export function TimeHud({ tick }: TimeHudProps) {
  const { day, hour, minute } = parseGameTime(tick);
  const icon = hour >= 6 && hour < 18 ? "☀️" : "🌙";

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        fontFamily: "monospace",
        fontSize: 11,
        color: "#e2e8f0",
        ...gradientForHour(hour),
        padding: "4px 8px",
        borderRadius: 4,
        border: "1px solid #334155",
        whiteSpace: "nowrap",
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      {icon} Day {day}&nbsp;&nbsp;{String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
    </div>
  );
}

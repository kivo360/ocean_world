// Streaming view of T3 LLM deliberations. The world keeps a ring buffer of
// the last N decisions; this panel renders newest-first with the full picture
// the model saw: situation, retrieved memories, picked action, rationale,
// and per-call latency.

import type { World } from "../simulation/world";

type DeliberationsPanelProps = {
  world: World;
  renderTick: number; // forces re-evaluation on each tick
  onSelectEntity: (id: string) => void;
};

const sectionStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #1e293b",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  opacity: 0.6,
  marginBottom: 4,
};

const KIND_COLORS: Record<string, string> = {
  speak: "#7dd3fc",
  trade: "#fbbf24",
  move_to: "#a78bfa",
  rest: "#34d399",
  noop: "#64748b",
};

export function DeliberationsPanel({
  world,
  renderTick: _renderTick,
  onSelectEntity,
}: DeliberationsPanelProps) {
  void _renderTick;
  const records = world.deliberations.slice().reverse();

  if (records.length === 0) {
    return (
      <div style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>
        Waiting for the LLM to deliberate…
        <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
          T3 fires when an entity's T2 score is below threshold or every ~80 ticks per entity.
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      <div style={{ ...sectionStyle, position: "sticky", top: 0, background: "#0f172a", zIndex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Deliberations</div>
        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
          {records.length} recent · {records.filter((r) => r.source === "live").length} live
        </div>
      </div>
      {records.map((r, idx) => (
        <div key={`${r.tick}-${r.entityId}-${idx}`} style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <button
              onClick={() => onSelectEntity(r.entityId)}
              style={{
                background: "transparent",
                border: 0,
                color: "#cfe3ff",
                cursor: "pointer",
                padding: 0,
                fontWeight: 600,
                textAlign: "left",
              }}
              title="Select this entity"
            >
              {r.entityName}{" "}
              <span style={{ fontSize: 10, opacity: 0.55, fontWeight: 400 }}>
                ({r.archetype})
              </span>
            </button>
            <span
              style={{
                fontSize: 10,
                opacity: 0.55,
                color: r.source === "live" ? "#a855f7" : "#94a3b8",
              }}
              title={`source: ${r.source} · latency ${r.latencyMs.toFixed(0)}ms`}
            >
              t{r.tick} · {r.source} · {r.latencyMs.toFixed(0)}ms
            </span>
          </div>

          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
            <span style={labelStyle as React.CSSProperties}>situation</span>
            <div style={{ marginTop: -2 }}>{r.situation}</div>
          </div>

          {r.retrievedMemories.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={labelStyle}>retrieved</div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 12,
                  fontSize: 11,
                  opacity: 0.75,
                }}
              >
                {r.retrievedMemories.map((m, i) => (
                  <li key={i}>
                    <span style={{ opacity: 0.55 }}>t{m.tick}</span> {m.kind}: {m.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 6, fontSize: 12 }}>
            <span style={labelStyle as React.CSSProperties}>action</span>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "baseline",
                marginTop: -2,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: KIND_COLORS[r.actionKind] ?? "#cfe3ff",
                }}
              >
                {r.actionKind}
              </span>
              {r.actionTarget && (
                <span style={{ opacity: 0.7 }}>→ {r.actionTarget}</span>
              )}
              {r.actionDetail && (
                <span style={{ opacity: 0.6 }}>· {r.actionDetail}</span>
              )}
            </div>
          </div>

          {r.rationale && (
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7, fontStyle: "italic" }}>
              "{r.rationale}"
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

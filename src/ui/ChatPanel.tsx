import { useMemo } from "react";
import { PLAYER_ID } from "../simulation/archetypes";
import type { World } from "../simulation/world";

const HEADER_HEIGHT = 28;

export function ChatPanel({
  world,
  renderTick,
  onSelectEntity,
}: {
  world: World;
  renderTick: number;
  onSelectEntity: (id: string) => void;
}) {
  const messages = useMemo(() => {
    return world.events
      .filter(
        (e) =>
          (e.kind === "speech" || e.kind === "trade") &&
          (e.source === PLAYER_ID || e.target === PLAYER_ID),
      )
      .slice(-50)
      .reverse(); // newest first
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          height: HEADER_HEIGHT,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #1e293b",
          fontSize: 11,
          color: "#94a3b8",
          letterSpacing: 0.4,
          flexShrink: 0,
        }}
      >
        chat — speech and trades involving you
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {messages.length === 0 ? (
          <div style={{ padding: 12, color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>
            No messages yet. Walk near a person and press{" "}
            <kbd
              style={{
                padding: "1px 5px",
                background: "#1e293b",
                borderRadius: 3,
                fontSize: 10,
                color: "#cfe3ff",
              }}
            >
              E
            </kbd>{" "}
            to greet them. Their reply will appear here.
          </div>
        ) : (
          messages.map((m, i) => {
            const isFromPlayer = m.source === PLAYER_ID;
            const otherId = isFromPlayer ? m.target : m.source;
            const other = otherId ? world.entities.get(otherId) : null;
            const otherName = other?.name ?? otherId ?? "?";
            return (
              <div
                key={`${m.tick}-${i}`}
                style={{
                  marginBottom: 8,
                  padding: "6px 8px",
                  background: isFromPlayer ? "rgba(125, 211, 252, 0.06)" : "#0b1220",
                  borderRadius: 6,
                  borderLeft: `2px solid ${isFromPlayer ? "#7dd3fc" : "#475569"}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    color: "#64748b",
                    marginBottom: 2,
                  }}
                >
                  <span>
                    {isFromPlayer ? "you → " : ""}
                    {!isFromPlayer && otherId && (
                      <button
                        onClick={() => onSelectEntity(otherId)}
                        style={{
                          background: "none",
                          border: 0,
                          padding: 0,
                          color: "#7dd3fc",
                          cursor: "pointer",
                          fontSize: 10,
                          textDecoration: "underline",
                        }}
                      >
                        {otherName}
                      </button>
                    )}
                    {isFromPlayer && otherId && (
                      <button
                        onClick={() => onSelectEntity(otherId)}
                        style={{
                          background: "none",
                          border: 0,
                          padding: 0,
                          color: "#7dd3fc",
                          cursor: "pointer",
                          fontSize: 10,
                          textDecoration: "underline",
                        }}
                      >
                        {otherName}
                      </button>
                    )}
                  </span>
                  <span>t{m.tick}</span>
                </div>
                <div style={{ fontSize: 12, color: "#cfe3ff" }}>{m.summary}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

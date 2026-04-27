import { useLayoutEffect, useRef, useState } from "react";
import type { EntitySnapshot } from "../simulation/entity";

const MAX_ENTRIES = 200;
const HEADER_HEIGHT = 28;

type ChatEntry = {
  uid: number;
  tick: number;
  speakerId: string;
  speakerName: string;
  text: string;
};

export function ChatLog({
  snapshots,
  renderTick,
}: {
  snapshots: readonly EntitySnapshot[];
  renderTick: number;
}) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const prevBubblesRef = useRef<Map<string, string | null>>(new Map());
  const uidRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  useLayoutEffect(() => {
    const prevBubbles = prevBubblesRef.current;
    const newEntries: ChatEntry[] = [];

    for (const snap of snapshots) {
      const prev = prevBubbles.get(snap.id);
      const curr = snap.speechBubble;

      if (curr !== null && curr !== undefined && curr !== prev) {
        newEntries.push({
          uid: uidRef.current++,
          tick: renderTick,
          speakerId: snap.id,
          speakerName: snap.name,
          text: curr,
        });
      }

      prevBubbles.set(snap.id, curr ?? null);
    }

    if (newEntries.length > 0) {
      setEntries((prev) => {
        const next = [...prev, ...newEntries];
        return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
      });
    }
  }, [renderTick, snapshots]);

  useLayoutEffect(() => {
    if (entries.length !== prevLengthRef.current) {
      prevLengthRef.current = entries.length;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  });

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
        <span style={{ flex: 1 }}>world log — all NPC speech</span>
        {entries.length > 0 && (
          <span style={{ opacity: 0.45, fontSize: 10 }}>{entries.length}</span>
        )}
      </div>

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", padding: 8 }}
      >
        {entries.length === 0 ? (
          <div
            style={{ padding: 12, color: "#64748b", fontSize: 12, lineHeight: 1.6 }}
          >
            Waiting for NPCs to speak… Speech bubbles from all entities will
            stream here as the simulation runs.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.uid}
              style={{
                marginBottom: 5,
                padding: "4px 8px",
                background: "#0b1220",
                borderRadius: 5,
                borderLeft: "2px solid #334155",
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
                <span style={{ color: "#7dd3fc" }}>{entry.speakerName}</span>
                <span>t{entry.tick}</span>
              </div>
              <div style={{ fontSize: 12, color: "#cfe3ff", lineHeight: 1.4 }}>
                {entry.text}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

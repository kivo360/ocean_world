import { useMemo } from "react";
import type { BrowserLoadResult } from "../ontology/browser-bundle";
import type { Domain } from "../ontology/types";
import { ARCHETYPE_COLORS } from "../renderer/theme";
import type { Archetype } from "../simulation/entity";
import type { ReasonerStatus } from "../ontology/oxigraph-reasoner";
import type { SurrealStatus } from "../simulation/surreal-graph-memory";
import type { World } from "../simulation/world";

type OntologyPanelProps = {
  result: BrowserLoadResult;
  world: World;
  renderTick: number; // forces re-evaluation of live archetype counts
  surrealStatus?: SurrealStatus;
  reasonerStatus?: ReasonerStatus;
};

const DOMAIN_TARGETS: Record<Domain, number> = {
  economic: 20,
  social: 18,
  cognitive: 15,
  governance: 12,
  environmental: 10,
  organizational: 15,
};

const DOMAIN_COLORS: Record<Domain, string> = {
  economic: "#fbbf24",
  social: "#7dd3fc",
  cognitive: "#a78bfa",
  governance: "#4ade80",
  environmental: "#34d399",
  organizational: "#f472b6",
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

export function OntologyPanel({
  result,
  world,
  renderTick,
  surrealStatus,
  reasonerStatus,
}: OntologyPanelProps) {
  const { bundle, registry, issues, domainCounts } = result;
  const counts = registry.counts();

  // Tally live archetype population (re-evaluated when renderTick changes).
  const archetypeCounts = useMemo(() => {
    const out = new Map<Archetype, number>();
    for (const e of world.entities.values()) {
      out.set(e.archetype, (out.get(e.archetype) ?? 0) + 1);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, renderTick]);

  const blockedIssues = issues.length;

  return (
    <div style={{ overflowY: "auto", height: "100%", fontSize: 12 }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Ontology</div>
        <div style={{ opacity: 0.7 }}>
          {counts.components} components · {counts.behaviors} behaviors ·{" "}
          {counts.archetypes} archetypes
        </div>
        <div style={{ opacity: 0.5, fontSize: 11, marginTop: 2 }}>
          {bundle.hierarchies.length} hierarchies ·{" "}
          {blockedIssues === 0 ? (
            <span style={{ color: "#4ade80" }}>0 issues</span>
          ) : (
            <span style={{ color: "#f87171" }}>{blockedIssues} issues</span>
          )}
        </div>
        <div style={{ opacity: 0.5, fontSize: 11, marginTop: 4 }}>
          memory graph:{" "}
          <span style={{ color: "#cfe3ff" }}>{world.memoryGraph.count()}</span> facts
        </div>
        {surrealStatus && (
          <div style={{ opacity: 0.55, fontSize: 11, marginTop: 2 }}>
            surreal:{" "}
            <span
              style={{
                color: surrealStatus.connected ? "#4ade80" : "#fbbf24",
              }}
            >
              {surrealStatus.effectiveMode}
              {surrealStatus.connected ? " · live" : " · offline"}
            </span>
            {surrealStatus.connected && (
              <>
                {" · "}
                <span>{surrealStatus.durableCount} durable</span>
                {surrealStatus.pendingWrites > 0 && (
                  <span> · {surrealStatus.pendingWrites} pending</span>
                )}
              </>
            )}
            {surrealStatus.lastError && !surrealStatus.connected && (
              <div style={{ color: "#fca5a5", marginTop: 2 }}>
                {surrealStatus.lastError}
              </div>
            )}
          </div>
        )}
        {reasonerStatus && (
          <div style={{ opacity: 0.55, fontSize: 11, marginTop: 2 }}>
            oxigraph:{" "}
            <span
              style={{ color: reasonerStatus.loaded ? "#4ade80" : "#fbbf24" }}
            >
              {reasonerStatus.loaded
                ? `${reasonerStatus.triples} triples`
                : "offline"}
            </span>
            {" · "}
            <span
              style={{
                color: world.policyViolations === 0 ? "#cfe3ff" : "#f87171",
              }}
            >
              {world.policyViolations} violations
            </span>
            {reasonerStatus.lastError && !reasonerStatus.loaded && (
              <div style={{ color: "#fca5a5", marginTop: 2 }}>
                {reasonerStatus.lastError}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Domain coverage</div>
        {(Object.keys(DOMAIN_TARGETS) as Domain[]).map((d) => {
          const have = (domainCounts[d]?.components ?? 0) + (domainCounts[d]?.behaviors ?? 0);
          const target = DOMAIN_TARGETS[d];
          const pct = Math.min(100, Math.round((have / target) * 100));
          const color = DOMAIN_COLORS[d];
          return (
            <div key={d} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span>{d}</span>
                <span style={{ opacity: 0.6 }}>
                  {have}/{target}
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 4,
                  background: "#1e293b",
                  borderRadius: 2,
                  marginTop: 2,
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: color,
                    borderRadius: 2,
                    transition: "width 200ms ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Archetypes (live)</div>
        {bundle.archetypes
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((a) => {
            const count = archetypeCounts.get(a.name as Archetype) ?? 0;
            const swatch = ARCHETYPE_COLORS[a.name as Archetype];
            const swatchStyle: React.CSSProperties = swatch
              ? { background: hex(swatch) }
              : { background: "#475569", border: "1px dashed #64748b" };
            return (
              <div
                key={a["@id"]}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 0",
                  opacity: count > 0 ? 1 : 0.45,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    flexShrink: 0,
                    ...swatchStyle,
                  }}
                />
                <span style={{ flex: 1 }}>{a.name}</span>
                <span style={{ opacity: 0.6 }}>{count}</span>
              </div>
            );
          })}
        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6 }}>
          Dimmed = declared in ontology but not currently spawned.
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Behaviors loaded</div>
        {bundle.behaviors
          .slice()
          .sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name))
          .map((b) => (
            <div
              key={b["@id"]}
              style={{
                display: "flex",
                gap: 6,
                padding: "2px 0",
                fontSize: 11,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  marginTop: 5,
                  flexShrink: 0,
                  background: DOMAIN_COLORS[b.domain],
                }}
              />
              <span style={{ flex: 1 }}>{b.name}</span>
              <span style={{ opacity: 0.5 }}>{b.state_machine.states.length} st</span>
            </div>
          ))}
      </div>

      {issues.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Validation issues</div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              fontSize: 11,
              color: "#fca5a5",
            }}
          >
            {issues.slice(0, 6).map((i, idx) => (
              <li key={idx} style={{ padding: "2px 0" }}>
                <span style={{ opacity: 0.7 }}>{i.path}</span>: {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

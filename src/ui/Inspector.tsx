import { useEffect, useState } from "react";
import type { Entity } from "../simulation/entity";
import type { WorldEvent } from "../simulation/actions";
import type { OntologyRegistry } from "../ontology/registry";
import type { Partner, SurrealGraphMemory } from "../simulation/surreal-graph-memory";
import type { World } from "../simulation/world";

const ARCHETYPE_COLORS: Record<string, string> = {
  Person: "#7dd3fc",
  Merchant: "#fbbf24",
  Wanderer: "#a78bfa",
  MarketMaker: "#f472b6",
  Lawkeeper: "#4ade80",
  Player: "#60a5fa",
};

type InspectorProps = {
  entity: Entity | null;
  events: ReadonlyArray<WorldEvent>;
  registry: OntologyRegistry;
  world: World;
  surrealGraph?: SurrealGraphMemory;
  onGiftItem?: () => void;
  onPinMemory?: () => void;
};

type SocialSnapshot = {
  tradePartners: Partner[];
  speechPartners: Partner[];
  twoHop: string[];
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "3px 0",
  fontSize: 12,
  borderBottom: "1px dashed #1e293b",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  opacity: 0.6,
  marginTop: 10,
  marginBottom: 2,
};

function bar(value: number, color: string): React.ReactNode {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ width: 80, height: 6, background: "#1e293b", borderRadius: 3 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

export function Inspector({ entity, events, registry, world, surrealGraph, onGiftItem, onPinMemory }: InspectorProps) {
  // Hooks must run unconditionally; gate downstream rendering on entity instead.
  const entityId = entity?.id ?? null;
  const [social, setSocial] = useState<SocialSnapshot | null>(null);

  useEffect(() => {
    if (!entityId || !surrealGraph) {
      setSocial(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [tradePartners, speechPartners, twoHop] = await Promise.all([
          surrealGraph.partnersOf(entityId, "trade", 5),
          surrealGraph.partnersOf(entityId, "speech", 5),
          surrealGraph.twoHopReach(entityId, 8),
        ]);
        if (!cancelled) setSocial({ tradePartners, speechPartners, twoHop });
      } catch {
        if (!cancelled) setSocial(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityId, surrealGraph]);

  if (!entity) {
    return (
      <div style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>
        Click an entity to inspect.
      </div>
    );
  }
  const p = entity.components.physical;
  const f = entity.components.financial;
  const c = entity.components.cognitive;
  const m = entity.components.memory;
  const inv = entity.components.inventory;
  const state = entity.state[entity.activeBehavior];

  const archetypeColor = ARCHETYPE_COLORS[entity.archetype] ?? "#64748b";

  const archetypeDoc = registry.getArchetype(`ecs:${entity.archetype}`);
  const activeBehaviorDoc = registry.getBehavior(`ecs:${entity.activeBehavior}`);

  const related = events
    .filter((e) => e.source === entity.id || e.target === entity.id)
    .slice(-12)
    .reverse();

  // Pull from the cross-entity graph: facts where this entity is subject OR
  // object, ranked by recency. Distinct from `related` (which only walks the
  // last 50 events) and from the per-entity ring buffer (which only has the
  // last 20 events this entity itself perceived).
  const graphFacts = world.memoryGraph.recentForEntity(entity.id, 8);

  const nameOf = (id: string): string =>
    world.entities.get(id)?.name ?? id;

  return (
    <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
          padding: "8px 10px",
          background: "#0a1628",
          borderRadius: 8,
          border: `1px solid ${archetypeColor}33`,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `${archetypeColor}18`,
            border: `2px solid ${archetypeColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 700,
            color: archetypeColor,
            flexShrink: 0,
            letterSpacing: -0.5,
            boxShadow: `0 0 12px ${archetypeColor}33`,
          }}
        >
          {entity.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entity.name}
          </div>
          <div
            style={{
              fontSize: 10,
              marginTop: 3,
              padding: "1px 7px",
              borderRadius: 999,
              display: "inline-block",
              background: `${archetypeColor}18`,
              border: `1px solid ${archetypeColor}66`,
              color: archetypeColor,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            {entity.archetype}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>
            <b>{entity.activeBehavior}</b> · {state?.phase ?? "Idle"}
          </div>
        </div>
      </div>

      {(onGiftItem || onPinMemory) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {onGiftItem && entity.archetype !== "Player" && (
            <button
              onClick={onGiftItem}
              title="Transfer 1 good from player to this entity"
              style={{
                fontSize: 11,
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid #4ade8044",
                background: "#0f172a",
                color: "#4ade80",
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              🎁 Gift item
            </button>
          )}
          {onPinMemory && (
            <button
              onClick={onPinMemory}
              title="Pin this entity to graph memory with high weight"
              style={{
                fontSize: 11,
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid #7dd3fc44",
                background: "#0f172a",
                color: "#7dd3fc",
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              📌 Pin memory
            </button>
          )}
        </div>
      )}

      {archetypeDoc && (
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
          {archetypeDoc.description ?? "Loaded from ontology."}
        </div>
      )}

      {p && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>physical</div>
          <div style={rowStyle}>
            <span>position</span>
            <span>
              ({p.x.toFixed(0)}, {p.y.toFixed(0)})
            </span>
          </div>
          <div style={rowStyle}>
            <span>energy</span>
            {bar(p.energy, "#34d399")}
          </div>
          <div style={rowStyle}>
            <span>perception</span>
            <span>{p.perceptionRadius}</span>
          </div>
        </div>
      )}

      {f && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>financial</div>
          <div style={rowStyle}>
            <span>money</span>
            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {f.money}
              <span style={{ fontSize: 10, background: "#fbbf2422", color: "#fbbf24", padding: "0 6px", borderRadius: 999, border: "1px solid #fbbf2444" }}>
                coin
              </span>
            </span>
          </div>
          <div style={rowStyle}>
            <span>goods</span>
            <span style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {f.goods}
              <span style={{ fontSize: 10, background: "#34d39922", color: "#34d399", padding: "0 6px", borderRadius: 999, border: "1px solid #34d39944" }}>
                good
              </span>
            </span>
          </div>
        </div>
      )}

      {inv && inv.items && Object.keys(inv.items).length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>inventory</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {Object.entries(inv.items).map(([name, qty]) => (
              <span
                key={name}
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "#818cf822",
                  border: "1px solid #818cf844",
                  color: "#a5b4fc",
                  letterSpacing: 0.3,
                }}
              >
                {name} ×{qty}
              </span>
            ))}
          </div>
        </div>
      )}

      {c && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>values</div>
          {Object.entries(c.values).map(([k, v]) => (
            <div key={k} style={rowStyle}>
              <span>{k}</span>
              {bar(v, "#fbbf24")}
            </div>
          ))}
        </div>
      )}

      {activeBehaviorDoc && (
        <div>
          <div style={sectionLabel}>active behavior — ontology</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>
            {activeBehaviorDoc.description}
          </div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>
            domain: {activeBehaviorDoc.domain} · states:{" "}
            {activeBehaviorDoc.state_machine.states.join(" → ")}
          </div>
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
            reads: {(activeBehaviorDoc.reads ?? []).map(stripPrefix).join(", ") || "—"}
          </div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>
            writes: {(activeBehaviorDoc.writes ?? []).map(stripPrefix).join(", ") || "—"}
          </div>
        </div>
      )}

      {archetypeDoc && (
        <div>
          <div style={sectionLabel}>archetype — ontology</div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>
            components: {archetypeDoc.components.map(stripPrefix).join(", ")}
          </div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>
            behaviors: {archetypeDoc.behaviors.map(stripPrefix).join(", ")}
          </div>
        </div>
      )}

      {surrealGraph && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            social network <span style={{ opacity: 0.5 }}>(via Surreal)</span>
          </div>
          {!social && (
            <div style={{ fontSize: 11, opacity: 0.5, padding: "4px 0" }}>
              loading…
            </div>
          )}
          {social && (
            <>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                <span style={{ opacity: 0.55, fontSize: 10 }}>TRADE PARTNERS</span>
                {social.tradePartners.length === 0 ? (
                  <div style={{ opacity: 0.45, padding: "2px 0" }}>none yet</div>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {social.tradePartners.map((p) => (
                      <li key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>{nameOf(p.id)}</span>
                        <span style={{ opacity: 0.55 }}>×{p.weight}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ fontSize: 11, marginTop: 6 }}>
                <span style={{ opacity: 0.55, fontSize: 10 }}>SPEECH PARTNERS</span>
                {social.speechPartners.length === 0 ? (
                  <div style={{ opacity: 0.45, padding: "2px 0" }}>none yet</div>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {social.speechPartners.slice(0, 5).map((p) => (
                      <li key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>{nameOf(p.id)}</span>
                        <span style={{ opacity: 0.55 }}>×{p.weight}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {social.twoHop.length > 0 && (
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  <span style={{ opacity: 0.55, fontSize: 10 }}>2-HOP REACH</span>
                  <div style={{ marginTop: 2, opacity: 0.7 }}>
                    {social.twoHop.slice(0, 8).map(nameOf).join(", ")}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>recent events</div>
        {related.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.5, padding: "4px 0" }}>none</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
            {related.map((e, i) => (
              <li
                key={i}
                style={{
                  padding: "3px 0",
                  borderBottom: "1px dashed #1e293b",
                  opacity: 0.9,
                }}
              >
                <span style={{ opacity: 0.5 }}>t{e.tick}</span>{" "}
                <span style={{ opacity: 0.6 }}>{e.kind}</span> {e.summary}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          graph memory <span style={{ opacity: 0.5 }}>({graphFacts.length})</span>
        </div>
        {graphFacts.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.5, padding: "4px 0" }}>
            no facts indexed yet
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
            {graphFacts.map((g) => {
              const role = g.subject === entity.id ? "→" : "←";
              const otherId = g.subject === entity.id ? g.object : g.subject;
              const other = otherId ? world.entities.get(otherId) : undefined;
              const otherLabel = other?.name ?? otherId ?? "—";
              return (
                <li
                  key={g.id}
                  style={{
                    padding: "3px 0",
                    borderBottom: "1px dashed #1e293b",
                    opacity: 0.85,
                  }}
                >
                  <span style={{ opacity: 0.5 }}>t{g.tick}</span>{" "}
                  <span
                    style={{
                      opacity: 0.65,
                      color: kindColor(g.kind),
                    }}
                  >
                    {g.kind}
                  </span>{" "}
                  {role} {otherLabel}: {g.summary}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {m && m.recent.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>memory (last {m.recent.length})</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
            {m.recent
              .slice(-6)
              .reverse()
              .map((e, i) => (
                <li
                  key={i}
                  style={{
                    padding: "3px 0",
                    borderBottom: "1px dashed #1e293b",
                    opacity: 0.8,
                  }}
                >
                  <span style={{ opacity: 0.5 }}>t{e.tick}</span> {e.kind}: {e.summary}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function stripPrefix(id: string): string {
  return id.startsWith("ecs:") ? id.slice(4) : id;
}

function kindColor(kind: string): string {
  switch (kind) {
    case "tax":
      return "#4ade80";
    case "trade":
      return "#fbbf24";
    case "speech":
      return "#7dd3fc";
    default:
      return "#cbd5e1";
  }
}

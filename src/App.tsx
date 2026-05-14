import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLAYER_ID, spawnPlayer } from "./simulation/archetypes";
import type { Archetype } from "./simulation/entity";
import {
  findNearestInteractTarget,
  pendingPlayerOffer,
  playerAcceptTrade,
  playerInteractMissed,
  playerOfferTrade,
  playerSpeak,
} from "./simulation/player-actions";
import { REGISTRY } from "./behaviors/registry";
import { FireworksT3Client } from "./llm/fireworks-t3-client";
import { FireworksClient } from "./llm/fireworks-client";
import { StubT3Client } from "./llm/stub-client";
import { T3Queue } from "./llm/t3-queue";
import type { T3Client } from "./llm/types";
import { loadBrowserOntology, type BrowserLoadResult } from "./ontology/browser-bundle";
import {
  createOntologyReasoner,
  type OntologyReasoner,
  type ReasonerStatus,
} from "./ontology/oxigraph-reasoner";
import { HoverPeek } from "./ui/HoverPeek";
import { Minimap } from "./ui/Minimap";
import { ProfilerSparkline } from "./ui/ProfilerSparkline";
import { TradePanel } from "./ui/TradePanel";
import { PixiStage } from "./renderer/PixiStage";
import { RegionLabel } from "./ui/RegionLabel";
import { smallVillage } from "./scenarios/small-village";
import { TimeHud } from "./ui/TimeHud";
import type { EntitySnapshot } from "./simulation/entity";
import {
  createSurrealGraphMemory,
  type SurrealGraphMemory,
} from "./simulation/surreal-graph-memory";
import { runTick } from "./simulation/tick";
import { addEntity, emit, snapshot, type World } from "./simulation/world";
import { ChatPanel } from "./ui/ChatPanel";
import { Controls } from "./ui/Controls";
import { DeliberationsPanel } from "./ui/DeliberationsPanel";
import {
  InteractionMenu,
  type InteractionChoice,
} from "./ui/InteractionMenu";
import { Inspector } from "./ui/Inspector";
import { OntologyPanel } from "./ui/OntologyPanel";
import { ScenarioOverlay } from "./ui/ScenarioOverlay";

// Viewport — what's visible on screen at any moment.
const STAGE_WIDTH = 1100;
const STAGE_HEIGHT = 700;
// World — the full simulated area. Larger than the viewport so the camera has
// somewhere to follow the player to.
const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1600;
const BASE_INTERVAL_MS = 180;
const PLAYER_SPEED_PX_PER_SEC = 220;
const MOVE_KEYS_UP = new Set(["w", "W", "ArrowUp"]);
const MOVE_KEYS_DOWN = new Set(["s", "S", "ArrowDown"]);
const MOVE_KEYS_LEFT = new Set(["a", "A", "ArrowLeft"]);
const MOVE_KEYS_RIGHT = new Set(["d", "D", "ArrowRight"]);
const ALL_MOVE_KEYS = new Set([
  ...MOVE_KEYS_UP,
  ...MOVE_KEYS_DOWN,
  ...MOVE_KEYS_LEFT,
  ...MOVE_KEYS_RIGHT,
]);
const INTERACT_KEYS = new Set(["e", "E"]);
const ACCEPT_KEYS = new Set(["y", "Y"]);
const INTERACT_COOLDOWN_MS = 400;
const INTERACT_RADIUS = 80;
const BROADCAST_RADIUS = 200;
const DAY_CYCLE_TICKS = 240;

const ARCHETYPE_LEGEND: ReadonlyArray<{ name: Archetype; color: string }> = [
  { name: "Person", color: "#7dd3fc" },
  { name: "Merchant", color: "#fbbf24" },
  { name: "Wanderer", color: "#a78bfa" },
  { name: "MarketMaker", color: "#f472b6" },
  { name: "Lawkeeper", color: "#4ade80" },
];
// Short, friendly. NPCs respond via Converse so meaning matters less than
// having varied openers — repeating the same line every time gets stale.
const PLAYER_GREETINGS = [
  "hi",
  "hello",
  "hey there",
  "what's up",
  "how goes it",
  "good day",
];

function buildWorldWithPlayer(opts: {
  width: number;
  height: number;
  seed?: number;
  memoryGraph: SurrealGraphMemory;
}): World {
  const world = smallVillage(opts);
  // (#70) Opt into per-tick profiler so the sparkline has data to render.
  world.tickProfile = { samples: [] };
  // Spawn the player at the centre of the first region so they start cleanly
  // inside one map rather than on a region boundary.
  const home = world.regions[0];
  const spawnX = home ? home.bounds.x + home.bounds.w / 2 : world.bounds.width / 2;
  const spawnY = home ? home.bounds.y + home.bounds.h / 2 : world.bounds.height / 2;
  addEntity(
    world,
    spawnPlayer({ bounds: world.bounds, tick: world.tick, x: spawnX, y: spawnY }),
  );
  if (home) world.activeRegionId = home.id;
  return world;
}

function buildT3Client(): T3Client {
  const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
  const apiKey = env.VITE_FIREWORKS_API_KEY;
  if (!apiKey) return new StubT3Client();
  try {
    const shared = new FireworksClient({
      apiKey,
      baseUrl: env.VITE_FIREWORKS_BASE_URL,
      defaultChatModel: env.VITE_FIREWORKS_CHAT_MODEL,
    });
    const client = new FireworksT3Client({}, shared);
    console.info(`[t3] live Fireworks client (model=${shared.defaultChatModel})`);
    return client;
  } catch (err) {
    console.warn("[t3] Fireworks init failed, falling back to stub:", err);
    return new StubT3Client();
  }
}

export default function App() {
  // Boot-time ontology load. Done once; the registry is the source of truth
  // for which archetypes/behaviors/components exist in this build.
  const ontologyRef = useRef<BrowserLoadResult>(loadBrowserOntology());

  // SurrealDB-backed graph memory. mem-only by default — flip to "indxdb" via
  // ?persist=1 to survive reloads. Falls back to pure in-memory cache if WASM
  // fails to load.
  const surrealGraphRef = useRef<SurrealGraphMemory>(
    createSurrealGraphMemory({
      mode: typeof window !== "undefined" && window.location.search.includes("persist=1")
        ? "indxdb"
        : "mem",
      logger: (m) => console.info(m),
    }),
  );

  // Oxigraph reasoner. Loads the bundle into a SPARQL-queryable store and
  // gates every behavior decision against the ontology's required_components.
  const reasonerRef = useRef<OntologyReasoner>(
    createOntologyReasoner({ logger: (m) => console.info(m) }),
  );
  const [reasonerStatus, setReasonerStatus] = useState<ReasonerStatus>(() =>
    reasonerRef.current.status(),
  );

  const worldRef = useRef<World>(
    buildWorldWithPlayer({
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      memoryGraph: surrealGraphRef.current,
    }),
  );
  const snapshotsRef = useRef<readonly EntitySnapshot[]>(snapshot(worldRef.current));
  const keysHeldRef = useRef<Set<string>>(new Set());
  const shiftHeldRef = useRef(false);
  const lastInteractAtRef = useRef(0);
  const menuTargetIdRef = useRef<string | null>(null);

  // T3 LLM client + queue. If `VITE_FIREWORKS_API_KEY` is set in .env.local
  // we wire the real Fireworks chat endpoint; otherwise fall back to the
  // deterministic stub so the simulation works offline. Switching takes effect
  // on app boot — provide the key via .env.local then restart the dev server.
  const t3QueueRef = useRef<T3Queue>(new T3Queue(buildT3Client(), 8));

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [t3UseEnabled, setT3UseEnabled] = useState(true);
  const [thinkingIds, setThinkingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [rightTab, setRightTab] = useState<"inspector" | "chat" | "deliberations">("inspector");
  const [menuTargetId, setMenuTargetId] = useState<string | null>(null);
  menuTargetIdRef.current = menuTargetId;
  const [tradeTargetId, setTradeTargetId] = useState<string | null>(null);

  const [archetypeFilter, setArchetypeFilter] = useState<Archetype | null>(null);
  const [speechDraft, setSpeechDraft] = useState("");
  const [broadcastDraft, setBroadcastDraft] = useState("");

  // Refs for callbacks so the effect only runs on width/height change.
  const getSnapshots = useCallback(() => snapshotsRef.current, []);
  const getSelectedId = useCallback(() => selectedId, [selectedId]);
  const getThinkingIds = useCallback(() => thinkingIds, [thinkingIds]);
  // Camera clamps to the active region's bounds rather than the full world,
  // so each region behaves like its own "screen." Falls back to world bounds
  // when no regions are defined.
  const getCameraBounds = useCallback(() => {
    const w = worldRef.current;
    if (w.regions.length > 0 && w.activeRegionId != null) {
      const active = w.regions.find((r) => r.id === w.activeRegionId);
      if (active) return active.bounds;
    }
    return { x: 0, y: 0, w: w.bounds.width, h: w.bounds.height };
  }, []);

  const getBroadcastFlash = useCallback(
    () => worldRef.current.broadcastFlash,
    [],
  );

  const doTick = useCallback(() => {
    runTick(worldRef.current, REGISTRY, {
      t3Queue: t3UseEnabled ? t3QueueRef.current : null,
      reasoner: reasonerRef.current,
    });
    snapshotsRef.current = snapshot(worldRef.current);
    if (t3UseEnabled) {
      const q = t3QueueRef.current;
      const next = new Set([...q.pendingEntityIds(), ...q.resolvedEntityIds()]);
      setThinkingIds(next);
    } else if (thinkingIds.size > 0) {
      setThinkingIds(new Set());
    }
    setRenderTick((t) => t + 1);
  }, [t3UseEnabled, thinkingIds]);

  // Tick driver.
  useEffect(() => {
    if (!playing) return;
    const interval = BASE_INTERVAL_MS / speed;
    const id = window.setInterval(doTick, interval);
    return () => window.clearInterval(id);
  }, [playing, speed, doTick]);

  // Player input. Keydown/keyup track held movement keys; preventDefault on
  // arrow keys stops the page from scrolling. Input is decoupled from the
  // tick rate so movement stays smooth at any sim speed.
  //
  // Interact: tap E (with a short cooldown) to greet the nearest NPC. Speech
  // unshifts onto the NPC's perceived.incomingSpeech, so their next decide()
  // sees it and Converse replies — visible as a speech bubble above them.
  useEffect(() => {
    const held = keysHeldRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.tagName === "INPUT" || focused?.tagName === "TEXTAREA") return;
      if (e.key === "Shift") { shiftHeldRef.current = true; return; }
      // Menu hotkeys take priority while it's open.
      if (menuTargetIdRef.current) {
        if (e.key === "Escape") {
          setMenuTargetId(null);
          return;
        }
        if (e.key === "1") {
          const w = worldRef.current;
          const target = menuTargetIdRef.current;
          const msg = w.rng.pick(PLAYER_GREETINGS);
          playerSpeak(w, target, msg);
          snapshotsRef.current = snapshot(w);
          setMenuTargetId(null);
          return;
        }
        if (e.key === "2") {
          setSelectedId(menuTargetIdRef.current);
          setRightTab("inspector");
          setMenuTargetId(null);
          return;
        }
        if (e.key === "3") {
          // (#42) Trade
          setTradeTargetId(menuTargetIdRef.current);
          setMenuTargetId(null);
          return;
        }
        if (e.key === "4") {
          // (#48) Befriend toggle
          const w = worldRef.current;
          const ent = w.entities.get(menuTargetIdRef.current);
          if (ent) {
            ent.befriendedBy = ent.befriendedBy === PLAYER_ID ? undefined : PLAYER_ID;
            w.speechBubbles.set(ent.id, {
              msg: ent.befriendedBy ? "friend!" : "...",
              expiresAtTick: w.tick + 4,
            });
            snapshotsRef.current = snapshot(w);
            setRenderTick((t) => t + 1);
          }
          setMenuTargetId(null);
          return;
        }
      }
      if (INTERACT_KEYS.has(e.key)) {
        const now = performance.now();
        if (now - lastInteractAtRef.current < INTERACT_COOLDOWN_MS) return;
        lastInteractAtRef.current = now;
        const w = worldRef.current;
        // Toggle: closing the menu if it was already open.
        if (menuTargetIdRef.current) {
          setMenuTargetId(null);
          return;
        }
        const targetId = findNearestInteractTarget(w, INTERACT_RADIUS);
        if (targetId) {
          setMenuTargetId(targetId);
        } else {
          playerInteractMissed(w);
          snapshotsRef.current = snapshot(w);
        }
        return;
      }
      if (ACCEPT_KEYS.has(e.key)) {
        const now = performance.now();
        if (now - lastInteractAtRef.current < INTERACT_COOLDOWN_MS) return;
        const w = worldRef.current;
        const offer = pendingPlayerOffer(w);
        if (!offer) return;
        lastInteractAtRef.current = now;
        playerAcceptTrade(w, offer);
        snapshotsRef.current = snapshot(w);
        setRenderTick((t) => t + 1); // force prompt to clear
        return;
      }
      if (!ALL_MOVE_KEYS.has(e.key)) return;
      held.add(e.key);
      if (e.key.startsWith("Arrow")) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeldRef.current = false;
      held.delete(e.key);
    };
    const onBlur = () => { held.clear(); shiftHeldRef.current = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Per-frame player mover. Mutates the player entity's physical.x/y based on
  // held keys and elapsed wall time, then refreshes snapshotsRef so PixiStage
  // (which reads it each RAF) sees the new position immediately rather than
  // waiting for the next sim tick.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // cap to avoid jumps on tab refocus
      last = now;
      const held = keysHeldRef.current;
      let dx = 0;
      let dy = 0;
      for (const k of held) {
        if (MOVE_KEYS_UP.has(k)) dy -= 1;
        else if (MOVE_KEYS_DOWN.has(k)) dy += 1;
        else if (MOVE_KEYS_LEFT.has(k)) dx -= 1;
        else if (MOVE_KEYS_RIGHT.has(k)) dx += 1;
      }
      if (dx !== 0 || dy !== 0) {
        const player = worldRef.current.entities.get(PLAYER_ID);
        const p = player?.components.physical;
        if (p) {
          const len = Math.hypot(dx, dy);
          const speedMul = shiftHeldRef.current ? 2 : 1;
          const move = PLAYER_SPEED_PX_PER_SEC * dt * speedMul;
          p.x += (dx / len) * move;
          p.y += (dy / len) * move;
          const b = worldRef.current.bounds;
          p.x = Math.max(10, Math.min(b.width - 10, p.x));
          p.y = Math.max(10, Math.min(b.height - 10, p.y));
          // Refresh snapshots so the renderer's RAF sees the new position
          // before the next sim tick fires.
          snapshotsRef.current = snapshot(worldRef.current);
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Boot SurrealDB once. Failure is non-fatal — the in-memory cache stays.
  useEffect(() => {
    const graph = surrealGraphRef.current;
    void graph.init();
    return () => {
      void graph.close();
    };
  }, []);

  // Dev-only window hook for debugging from the console:
  //   window.__OCEAN__.world / .t3 / .surreal / .reasoner
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { __OCEAN__: unknown }).__OCEAN__ = {
      world: worldRef.current,
      t3: t3QueueRef.current,
      surreal: surrealGraphRef.current,
      reasoner: reasonerRef.current,
      ontology: ontologyRef.current,
    };
  });

  // Boot Oxigraph reasoner once with the loaded ontology bundle. Failure is
  // non-fatal — the runtime guardrail simply becomes a no-op.
  useEffect(() => {
    const reasoner = reasonerRef.current;
    void reasoner.init(ontologyRef.current.bundle).then((status) => {
      setReasonerStatus(status);
    });
  }, []);

  const reset = useCallback(() => {
    worldRef.current = buildWorldWithPlayer({
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      seed: Math.floor(Math.random() * 1_000_000),
      memoryGraph: surrealGraphRef.current,
    });
    snapshotsRef.current = snapshot(worldRef.current);
    t3QueueRef.current = new T3Queue(buildT3Client(), 8);
    setSelectedId(null);
    setThinkingIds(new Set());
    setRenderTick((t) => t + 1);
  }, []);

  const selectedEntity = useMemo(() => {
    if (!selectedId) return null;
    return worldRef.current.entities.get(selectedId) ?? null;
    // renderTick dependency keeps the inspector fresh each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, renderTick]);

  const events = useMemo(
    () => worldRef.current.events.slice(-50),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderTick],
  );

  const activeRegionName = useMemo(() => {
    const w = worldRef.current;
    const r = w.regions.find((x) => x.id === w.activeRegionId);
    return r?.name ?? null;
    // renderTick keeps this fresh as the player crosses boundaries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick]);

  const worldTick = useMemo(() => worldRef.current.tick, [renderTick]);

  const viewportBounds = useMemo(() => {
    const snaps = snapshotsRef.current;
    const player = snaps.find((s) => s.id === PLAYER_ID);
    if (!player) return { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT };
    return {
      x: Math.max(0, Math.min(WORLD_WIDTH - STAGE_WIDTH, player.x - STAGE_WIDTH / 2)),
      y: Math.max(0, Math.min(WORLD_HEIGHT - STAGE_HEIGHT, player.y - STAGE_HEIGHT / 2)),
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
    };
  }, [renderTick]);

  const playerChatCount = useMemo(() => {
    return worldRef.current.events.reduce(
      (n, e) =>
        (e.kind === "speech" || e.kind === "trade") &&
        (e.source === PLAYER_ID || e.target === PLAYER_ID)
          ? n + 1
          : n,
      0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick]);

  const playerOffer = useMemo(() => {
    const w = worldRef.current;
    const offer = pendingPlayerOffer(w);
    if (!offer) return null;
    const seller = w.entities.get(offer.from);
    return offer
      ? { ...offer, sellerName: seller?.name ?? offer.from }
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick]);

  const playerWallet = useMemo(() => {
    const player = worldRef.current.entities.get(PLAYER_ID);
    return player?.components.financial ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick]);

  const menuTarget = useMemo(() => {
    if (!menuTargetId) return null;
    return worldRef.current.entities.get(menuTargetId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuTargetId, renderTick]);

  // Auto-close the menu when the player walks the target out of range. Saves
  // the user from having to press Esc just because they kept moving.
  useEffect(() => {
    if (!menuTargetId) return;
    const player = worldRef.current.entities.get(PLAYER_ID);
    const target = worldRef.current.entities.get(menuTargetId);
    const pp = player?.components.physical;
    const tp = target?.components.physical;
    if (!pp || !tp) {
      setMenuTargetId(null);
      return;
    }
    const dx = pp.x - tp.x;
    const dy = pp.y - tp.y;
    if (dx * dx + dy * dy > INTERACT_RADIUS * INTERACT_RADIUS) {
      setMenuTargetId(null);
    }
  }, [menuTargetId, renderTick]);

  const handleMenuChoice = useCallback(
    (choice: InteractionChoice) => {
      const w = worldRef.current;
      const target = menuTargetIdRef.current;
      if (!target) return;
      if (choice === "talk") {
        const msg = w.rng.pick(PLAYER_GREETINGS);
        playerSpeak(w, target, msg);
        snapshotsRef.current = snapshot(w);
      } else if (choice === "inspect") {
        setSelectedId(target);
        setRightTab("inspector");
      } else if (choice === "trade") {
        // (#42) Open the trade panel — the menu closes, panel takes over.
        setTradeTargetId(target);
      } else if (choice === "befriend") {
        // (#48) Toggle befriended-by state. Befriended NPCs orbit the player
        // via Wander; toggling off restores random wandering.
        const ent = w.entities.get(target);
        if (ent) {
          ent.befriendedBy = ent.befriendedBy === PLAYER_ID ? undefined : PLAYER_ID;
          w.speechBubbles.set(target, {
            msg: ent.befriendedBy ? "friend!" : "...",
            expiresAtTick: w.tick + 4,
          });
          snapshotsRef.current = snapshot(w);
          setRenderTick((t) => t + 1);
        }
      }
      setMenuTargetId(null);
    },
    [],
  );

  const handleTradeOffer = useCallback(
    (goods: number, money: number) => {
      if (!tradeTargetId) return;
      const result = playerOfferTrade(worldRef.current, tradeTargetId, goods, money);
      // Surface failure feedback as a brief speech bubble on the player.
      if (result.kind === "rejected") {
        worldRef.current.speechBubbles.set(PLAYER_ID, {
          msg: `${result.partnerName} declined`,
          expiresAtTick: worldRef.current.tick + 4,
        });
      } else if (result.kind === "no-funds" || result.kind === "no-goods") {
        worldRef.current.speechBubbles.set(PLAYER_ID, {
          msg: "can't afford",
          expiresAtTick: worldRef.current.tick + 4,
        });
      }
      snapshotsRef.current = snapshot(worldRef.current);
      setRenderTick((t) => t + 1);
      setTradeTargetId(null);
    },
    [tradeTargetId],
  );

  const handleDirectSpeak = useCallback((msg: string) => {
    if (!msg.trim()) return;
    const w = worldRef.current;
    const targetId = findNearestInteractTarget(w, INTERACT_RADIUS);
    if (targetId) {
      playerSpeak(w, targetId, msg.trim());
      snapshotsRef.current = snapshot(w);
      setRenderTick((t) => t + 1);
    }
  }, []);

  const handleBroadcast = useCallback((msg: string) => {
    if (!msg.trim()) return;
    const w = worldRef.current;
    const player = w.entities.get(PLAYER_ID);
    const pp = player?.components.physical;
    if (!pp) return;
    let spoke = false;
    for (const [id, entity] of w.entities) {
      if (id === PLAYER_ID) continue;
      const ep = entity.components.physical;
      if (!ep) continue;
      const dx = pp.x - ep.x;
      const dy = pp.y - ep.y;
      if (dx * dx + dy * dy <= BROADCAST_RADIUS * BROADCAST_RADIUS) {
        playerSpeak(w, id, msg.trim());
        spoke = true;
      }
    }
    if (spoke) {
      snapshotsRef.current = snapshot(w);
      setRenderTick((t) => t + 1);
    }
  }, []);

  const handleGiftItem = useCallback(() => {
    const w = worldRef.current;
    const targetId = selectedId;
    if (!targetId) return;
    const player = w.entities.get(PLAYER_ID);
    const target = w.entities.get(targetId);
    if (!player || !target) return;
    const pf = player.components.financial;
    const tf = target.components.financial;
    if (!pf || !tf || pf.goods < 1) return;
    pf.goods -= 1;
    tf.goods += 1;
    w.speechBubbles.set(targetId, {
      msg: "🎁",
      expiresAtTick: w.tick + 60,
    });
    emit(w, {
      kind: "trade",
      source: PLAYER_ID,
      target: targetId,
      summary: `Player gifted 1 good to ${target.name}`,
    });
    snapshotsRef.current = snapshot(w);
    setRenderTick((t) => t + 1);
  }, [selectedId]);

  const handlePinMemory = useCallback(() => {
    const w = worldRef.current;
    const targetId = selectedId;
    if (!targetId) return;
    const target = w.entities.get(targetId);
    if (!target) return;
    w.memoryGraph.insert({
      tick: w.tick,
      kind: "pinned",
      subject: targetId,
      summary: `[PINNED] ${target.name} (${target.archetype})`,
    });
    snapshotsRef.current = snapshot(w);
    setRenderTick((t) => t + 1);
  }, [selectedId]);

  const t3Stats = t3QueueRef.current.size();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8, padding: 12 }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "0 4px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18, letterSpacing: 0.4 }}>Ocean World</h1>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            ECS + T1/T2/T3 tick loop · registry-driven · PixiJS renderer
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          {playerWallet && (
            <div
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 999,
                background: "#1e293b",
                color: "#fbbf24",
                letterSpacing: 0.4,
              }}
            >
              {playerWallet.money}m · {playerWallet.goods}g
            </div>
          )}
          {activeRegionName && (
            <div
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 999,
                background: "#1e293b",
                color: "#cfe3ff",
                letterSpacing: 0.4,
              }}
            >
              {activeRegionName}
            </div>
          )}
          <div
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 999,
              background: "#1e293b",
              color: worldRef.current.tick % DAY_CYCLE_TICKS < DAY_CYCLE_TICKS / 2 ? "#fbbf24" : "#a78bfa",
              letterSpacing: 0.4,
            }}
          >
            {worldRef.current.tick % DAY_CYCLE_TICKS < DAY_CYCLE_TICKS / 2 ? "☀️ Day" : "🌙 Night"} · t{worldRef.current.tick}
          </div>
          <div style={{ fontSize: 11, opacity: 0.5 }}>
            WASD/arrows · Shift sprint · E greet · Y accept · click to inspect
          </div>
        </div>
      </header>

      <Controls
        playing={playing}
        speed={speed}
        tick={worldRef.current.tick}
        entityCount={worldRef.current.entities.size}
        t3Stats={t3Stats}
        t3Live={t3QueueRef.current.live}
        t3Enabled={t3UseEnabled}
        onPlayPause={() => setPlaying((p) => !p)}
        onStep={doTick}
        onSpeed={setSpeed}
        onReset={reset}
        onToggleT3={() => setT3UseEnabled((v) => !v)}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 2px",
          flexWrap: "wrap",
        }}
      >
        {ARCHETYPE_LEGEND.map(({ name, color }) => (
          <button
            key={name}
            onClick={() => setArchetypeFilter((prev) => (prev === name ? null : name))}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 999,
              border: `1px solid ${color}`,
              background: archetypeFilter === name ? color : "transparent",
              color: archetypeFilter === name ? "#0f172a" : color,
              cursor: "pointer",
              letterSpacing: 0.3,
            }}
          >
            {name}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <ProfilerSparkline
          profile={worldRef.current.tickProfile}
          renderTick={renderTick}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleDirectSpeak(speechDraft);
            setSpeechDraft("");
          }}
          style={{ display: "flex", gap: 4 }}
        >
          <input
            value={speechDraft}
            onChange={(e) => setSpeechDraft(e.target.value)}
            placeholder="Say to nearest…"
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#cfe3ff",
              width: 160,
            }}
          />
          <button
            type="submit"
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#1e293b",
              color: "#cfe3ff",
              cursor: "pointer",
            }}
          >
            Say
          </button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleBroadcast(broadcastDraft);
            setBroadcastDraft("");
          }}
          style={{ display: "flex", gap: 4 }}
        >
          <input
            value={broadcastDraft}
            onChange={(e) => setBroadcastDraft(e.target.value)}
            placeholder="Broadcast…"
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#cfe3ff",
              width: 140,
            }}
          />
          <button
            type="submit"
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#1e293b",
              color: "#cfe3ff",
              cursor: "pointer",
            }}
          >
            📢
          </button>
        </form>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `260px ${STAGE_WIDTH}px 320px`,
          gap: 8,
          flex: 1,
          minHeight: 0,
        }}
      >
        <aside
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 8,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <OntologyPanel
            result={ontologyRef.current}
            world={worldRef.current}
            renderTick={renderTick}
            surrealStatus={surrealGraphRef.current.status()}
            reasonerStatus={reasonerStatus}
          />
        </aside>
        <div
          style={{
            position: "relative",
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            background: "#0b1220",
            border: "1px solid #1e293b",
            borderRadius: 8,
            overflow: "hidden",
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
        >
          <PixiStage
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
            worldWidth={WORLD_WIDTH}
            worldHeight={WORLD_HEIGHT}
            cameraTargetId={PLAYER_ID}
            getCameraBounds={getCameraBounds}
            getSnapshots={getSnapshots}
            getSelectedId={getSelectedId}
            getThinkingIds={getThinkingIds}
            onSelect={setSelectedId}
            getBroadcastFlash={getBroadcastFlash}
            onHover={setHoveredId}
            interactRadius={INTERACT_RADIUS}
          />
          {hoveredId && (() => {
            const snap = snapshotsRef.current.find((s) => s.id === hoveredId);
            return snap ? (
              <HoverPeek
                name={snap.name}
                archetype={snap.archetype}
                mouseX={mousePos.x}
                mouseY={mousePos.y}
              />
            ) : null;
          })()}
          <ScenarioOverlay
            world={worldRef.current}
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
            // re-render on tick — wrapped in a key so React diffs cheap
            key={`scenario-${renderTick}`}
          />
          <TimeHud tick={worldTick} />
          <Minimap
            entities={snapshotsRef.current}
            regions={worldRef.current.regions}
            worldWidth={WORLD_WIDTH}
            worldHeight={WORLD_HEIGHT}
            viewportBounds={viewportBounds}
          />
          <RegionLabel regionName={activeRegionName} />
          {playerOffer && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: 16,
                transform: "translateX(-50%)",
                background: "rgba(15, 23, 42, 0.95)",
                border: "1px solid #fbbf24",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 12,
                color: "#cfe3ff",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
              }}
            >
              <span>
                <strong style={{ color: "#fbbf24" }}>{playerOffer.sellerName}</strong> offers{" "}
                <strong>{playerOffer.goods}</strong> goods for{" "}
                <strong>{playerOffer.price}</strong> money
              </span>
              <kbd
                style={{
                  padding: "2px 6px",
                  background: "#1e293b",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#fbbf24",
                  border: "1px solid #fbbf24",
                }}
              >
                Y
              </kbd>
            </div>
          )}
          {menuTarget && (
            <InteractionMenu
              target={menuTarget}
              screenX={STAGE_WIDTH / 2}
              screenY={STAGE_HEIGHT - (playerOffer ? 80 : 16)}
              onChoose={handleMenuChoice}
            />
          )}
          {tradeTargetId && (() => {
            const partner = worldRef.current.entities.get(tradeTargetId);
            const player = worldRef.current.entities.get(PLAYER_ID);
            const pf = player?.components.financial;
            if (!partner || !pf) return null;
            return (
              <TradePanel
                partnerName={partner.name}
                playerGoods={pf.goods}
                playerMoney={pf.money}
                onOffer={handleTradeOffer}
                onClose={() => setTradeTargetId(null)}
              />
            );
          })()}
        </div>
        <aside
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 8,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #1e293b",
              flexShrink: 0,
            }}
          >
            {(["inspector", "chat", "deliberations"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  background: rightTab === tab ? "#1e293b" : "transparent",
                  border: 0,
                  borderBottom:
                    rightTab === tab ? "2px solid #3b82f6" : "2px solid transparent",
                  color: rightTab === tab ? "#cfe3ff" : "#64748b",
                  cursor: "pointer",
                  fontSize: 12,
                  textTransform: "capitalize",
                }}
              >
                {tab}
                {tab === "chat" && playerChatCount > 0 && (
                  <span style={{ marginLeft: 6, opacity: 0.6 }}>{playerChatCount}</span>
                )}
                {tab === "deliberations" && worldRef.current.deliberations.length > 0 && (
                  <span style={{ marginLeft: 6, opacity: 0.6 }}>
                    {worldRef.current.deliberations.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            {rightTab === "inspector" && (
              <Inspector
                entity={selectedEntity}
                events={events}
                registry={ontologyRef.current.registry}
                world={worldRef.current}
                surrealGraph={surrealGraphRef.current}
                onGiftItem={handleGiftItem}
                onPinMemory={handlePinMemory}
              />
            )}
            {rightTab === "chat" && (
              <ChatPanel
                world={worldRef.current}
                renderTick={renderTick}
                onSelectEntity={(id) => {
                  setSelectedId(id);
                  setRightTab("inspector");
                }}
              />
            )}
            {rightTab === "deliberations" && (
              <DeliberationsPanel
                world={worldRef.current}
                renderTick={renderTick}
                onSelectEntity={(id) => {
                  setSelectedId(id);
                  setRightTab("inspector");
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

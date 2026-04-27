// Surreal-backed GraphMemory. The synchronous interface is preserved so the
// tick loop doesn't change: reads come from a fast in-memory cache, writes
// fan out to SurrealDB asynchronously in batched flushes. SurrealDB then
// becomes the durable substrate for graph queries that go beyond what the
// simple cache supports (multi-hop traversal, joins, persistence across
// reloads via IndexedDB).
//
// Modes:
//   - "off"    → no-op wrapper around the in-memory cache. For tests.
//   - "mem"    → SurrealDB embedded WASM, in-memory only. Resets per session.
//   - "indxdb" → SurrealDB embedded WASM persisted to IndexedDB. Survives
//                reloads.
//
// On boot, the chosen mode tries to connect; if the WASM engine fails to
// load (Node test env, blocked CDN, etc.) we fall back to "off" silently and
// keep the cache.

import { createGraphMemory, type GraphFact, type GraphMemory } from "./graph-memory";

export type SurrealGraphMode = "off" | "mem" | "indxdb";

export type SurrealGraphMemoryOptions = {
  mode?: SurrealGraphMode;        // default: "indxdb"
  database?: string;              // default: "ocean.world"
  flushIntervalMs?: number;       // default: 750
  /** Explicit WASM URL — required in browser (Vite ?url import) so the
   *  embedded engine can locate its payload. Optional in Node. */
  wasmUrl?: string | URL;
  logger?: (msg: string) => void;
};

export type SurrealStatus = {
  mode: SurrealGraphMode;
  effectiveMode: SurrealGraphMode; // what we actually fell back to
  connected: boolean;
  pendingWrites: number;
  durableCount: number;
  lastError?: string;
};

export type Partner = { id: string; weight: number };

export interface SurrealGraphMemory extends GraphMemory {
  init(): Promise<void>;
  status(): SurrealStatus;
  /** Entities that share a `kind` interaction with `entityId`, ranked by frequency. */
  partnersOf(entityId: string, kind: string, limit?: number): Promise<Partner[]>;
  /** Entities reachable in two hops via interactions of any kind. */
  twoHopReach(entityId: string, limit?: number): Promise<string[]>;
  /** Force a flush of pending writes. */
  flush(): Promise<void>;
  /** Disconnect cleanly. */
  close(): Promise<void>;
}

// Minimal structural shape so we don't hard-import the surrealdb types at
// module load time (keeps Node tests happy when WASM doesn't initialize).
type SurrealClient = {
  connect(url: string, options?: unknown): Promise<unknown>;
  use(opts: { namespace: string; database: string }): Promise<unknown>;
  query<T = unknown>(sql: string, vars?: Record<string, unknown>): Promise<T[]>;
  close(): Promise<void>;
};

const SCHEMA_DDL = `
  DEFINE TABLE IF NOT EXISTS fact SCHEMALESS PERMISSIONS FULL;
  DEFINE FIELD IF NOT EXISTS tick ON fact TYPE int;
  DEFINE FIELD IF NOT EXISTS kind ON fact TYPE string;
  DEFINE FIELD IF NOT EXISTS subject ON fact TYPE string;
  DEFINE FIELD IF NOT EXISTS object ON fact TYPE option<string>;
  DEFINE FIELD IF NOT EXISTS summary ON fact TYPE string;
  DEFINE INDEX IF NOT EXISTS fact_subject ON fact COLUMNS subject;
  DEFINE INDEX IF NOT EXISTS fact_object ON fact COLUMNS object;
  DEFINE INDEX IF NOT EXISTS fact_kind ON fact COLUMNS kind;
  DEFINE INDEX IF NOT EXISTS fact_tick ON fact COLUMNS tick;
`;

export function createSurrealGraphMemory(
  opts: SurrealGraphMemoryOptions = {},
): SurrealGraphMemory {
  const cache = createGraphMemory();
  const log = opts.logger ?? (() => undefined);
  const mode: SurrealGraphMode = opts.mode ?? "indxdb";
  const database = opts.database ?? "ocean.world";
  const flushIntervalMs = opts.flushIntervalMs ?? 750;

  let client: SurrealClient | null = null;
  let effectiveMode: SurrealGraphMode = mode;
  let connected = false;
  let lastError: string | undefined;
  let durableCount = 0;
  const pending: GraphFact[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let flushing: Promise<void> | null = null;
  let initInflight: Promise<void> | null = null;

  async function connect(): Promise<void> {
    if (mode === "off") {
      effectiveMode = "off";
      return;
    }
    try {
      // Dynamic imports keep these out of the Node test bundle and let Vite
      // code-split the WASM payloads.
      const [{ Surreal }, { createWasmEngines }] = await Promise.all([
        import("surrealdb"),
        import("@surrealdb/wasm"),
      ]);
      const db = new Surreal({ engines: createWasmEngines() }) as unknown as SurrealClient;
      const url = mode === "indxdb" ? `indxdb://${database.split(".")[0]}` : "mem://";
      log(`[surreal-graph] connecting url=${url}`);
      await db.connect(url);
      const [ns, dbName] = database.split(".");
      await db.use({ namespace: ns ?? "ocean", database: dbName ?? "world" });
      await db.query(SCHEMA_DDL);
      const countRows = await db.query<{ count: number }>(
        "SELECT count() AS count FROM fact GROUP ALL",
      );
      const innerArr = Array.isArray(countRows[0]) ? countRows[0] as unknown as Array<{ count: number }> : [];
      durableCount = innerArr[0]?.count ?? 0;
      client = db;
      connected = true;
      log(`[surreal-graph] connected mode=${mode} db=${database} existing=${durableCount}`);
    } catch (err) {
      lastError = (err as Error).message;
      effectiveMode = "off";
      connected = false;
      // Surface to user console too so the panel error is matched by a real stack.
      console.error("[surreal-graph] init failed", err);
    }
  }

  async function flush(): Promise<void> {
    if (!client || !connected) return;
    if (pending.length === 0) return;
    if (flushing) return flushing;
    const batch = pending.splice(0, pending.length);
    flushing = (async () => {
      try {
        // Insert all queued facts in a single statement.
        const rows = batch.map((f) => ({
          tick: f.tick,
          kind: f.kind,
          subject: f.subject,
          object: f.object ?? null,
          summary: f.summary,
        }));
        await client!.query("INSERT INTO fact $rows;", { rows });
        durableCount += batch.length;
      } catch (err) {
        lastError = (err as Error).message;
        log(`[surreal-graph] flush failed: ${lastError}`);
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  }

  function startFlushTimer(): void {
    if (flushTimer || effectiveMode === "off") return;
    if (typeof globalThis.setInterval !== "function") return; // SSR / Node test
    flushTimer = setInterval(() => {
      void flush();
    }, flushIntervalMs);
  }

  return {
    insert(input) {
      const fact = cache.insert(input);
      if (effectiveMode !== "off") pending.push(fact);
      return fact;
    },
    recentForEntity: cache.recentForEntity,
    search: cache.search,
    all: cache.all,
    count: cache.count,
    ttlPrune(currentTick, ttlTicks, hardCap) {
      // Cache prune is authoritative for sync reads. Mirror to Surreal in the
      // background — best-effort, no need to await.
      const removed = cache.ttlPrune(currentTick, ttlTicks, hardCap);
      if (client && connected && removed > 0) {
        const cutoff = currentTick - ttlTicks;
        client
          .query("DELETE FROM fact WHERE tick < $cutoff;", { cutoff })
          .catch((err) => {
            lastError = (err as Error).message;
            log(`[surreal-graph] ttl delete failed: ${lastError}`);
          });
      }
      return removed;
    },

    async init() {
      // Idempotent: React strict mode mounts effects twice in dev. A second
      // connect() against an already-open Surreal handle is harmless but
      // wasteful; just no-op once we've resolved.
      if (initInflight) return initInflight;
      if (connected) return;
      initInflight = (async () => {
        try {
          await connect();
          startFlushTimer();
        } finally {
          initInflight = null;
        }
      })();
      return initInflight;
    },

    status() {
      return {
        mode,
        effectiveMode,
        connected,
        pendingWrites: pending.length,
        durableCount,
        lastError,
      };
    },

    async partnersOf(entityId, kind, limit = 8) {
      if (!client || !connected) return [];
      const sql = `
        LET $out = (SELECT object AS id FROM fact WHERE subject = $eid AND kind = $kind AND object IS NOT NONE);
        LET $in  = (SELECT subject AS id FROM fact WHERE object  = $eid AND kind = $kind);
        SELECT id, count() AS weight FROM (RETURN array::concat($out, $in)) GROUP BY id ORDER BY weight DESC LIMIT $lim;
      `;
      try {
        const result = await client.query<Partner>(sql, { eid: entityId, kind, lim: limit });
        const rows = (result[result.length - 1] ?? []) as unknown as Partner[];
        return rows.filter((r) => r.id && r.id !== entityId);
      } catch (err) {
        lastError = (err as Error).message;
        log(`[surreal-graph] partnersOf failed: ${lastError}`);
        return [];
      }
    },

    async twoHopReach(entityId, limit = 12) {
      if (!client || !connected) return [];
      const sql = `
        LET $direct = (
          SELECT VALUE object FROM fact WHERE subject = $eid AND object IS NOT NONE
          UNION
          SELECT VALUE subject FROM fact WHERE object = $eid
        );
        SELECT VALUE object FROM fact WHERE subject IN $direct AND object IS NOT NONE AND object != $eid LIMIT $lim;
      `;
      try {
        const result = await client.query<string>(sql, { eid: entityId, lim: limit });
        const rows = (result[result.length - 1] ?? []) as unknown as string[];
        return Array.from(new Set(rows));
      } catch (err) {
        lastError = (err as Error).message;
        log(`[surreal-graph] twoHopReach failed: ${lastError}`);
        return [];
      }
    },

    async flush() {
      await flush();
    },

    async close() {
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      await flush();
      if (client) await client.close().catch(() => undefined);
      client = null;
      connected = false;
    },
  };
}

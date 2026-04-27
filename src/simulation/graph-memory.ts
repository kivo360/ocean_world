// Cross-entity event graph. Replaces the per-entity MemoryLog ring buffer as
// the source of "what happened that I should know about" — same data, but
// indexed so any entity (or T3 deliberation) can retrieve relevant facts about
// any other entity by id, kind, recency, or lexical match.
//
// Lexical-only today: token overlap with mild idf weighting. Embeddings can
// drop in behind the same `search()` interface later (sqlite-vec / libsql /
// Zep) without callers changing.
//
// Storage is a Map<id, fact> so prune is safe (ids remain stable even after
// removal). Search is O(N) where N is the number of unpruned facts — fine
// for 1k–10k facts in the browser.

export type GraphFact = {
  id: number;
  tick: number;
  kind: string;          // event kind: speech | trade | tax | needs_deliberation | ...
  subject: string;       // initiating entity id
  object?: string;       // affected entity id, if any
  summary: string;       // human-readable
  tokens: string[];      // pre-tokenized for search
};

export type SearchOptions = {
  query?: string;        // free-text query (token overlap)
  entityId?: string;     // any fact where subject == id OR object == id
  kind?: string;         // filter by event kind
  sinceTick?: number;    // only facts at or after this tick
  limit?: number;        // default 8
};

export type ScoredFact = GraphFact & { score: number };

export interface GraphMemory {
  insert(fact: Omit<GraphFact, "id" | "tokens">): GraphFact;
  recentForEntity(entityId: string, limit: number): GraphFact[];
  search(opts: SearchOptions): ScoredFact[];
  all(): GraphFact[];
  count(): number;
  ttlPrune(currentTick: number, ttlTicks: number, hardCap: number): number;
}

const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "for", "in", "on", "at", "and", "or", "by",
  "is", "are", "was", "were", "be", "with", "from", "that", "this", "it",
  "as", "if", "so", "but", "not", "no", "yes", "you", "i", "me", "my", "your",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function createGraphMemory(): GraphMemory {
  // Map preserves insertion order and lets us drop facts mid-stream without
  // disturbing the id space.
  const facts = new Map<number, GraphFact>();
  const bySubject = new Map<string, Set<number>>();
  const byObject = new Map<string, Set<number>>();
  const byKind = new Map<string, Set<number>>();
  let nextId = 0;

  function indexFact(fact: GraphFact): void {
    appendIndex(bySubject, fact.subject, fact.id);
    if (fact.object) appendIndex(byObject, fact.object, fact.id);
    appendIndex(byKind, fact.kind, fact.id);
  }

  function unindexFact(fact: GraphFact): void {
    bySubject.get(fact.subject)?.delete(fact.id);
    if (fact.object) byObject.get(fact.object)?.delete(fact.id);
    byKind.get(fact.kind)?.delete(fact.id);
  }

  function appendIndex(idx: Map<string, Set<number>>, key: string, id: number): void {
    let set = idx.get(key);
    if (!set) {
      set = new Set();
      idx.set(key, set);
    }
    set.add(id);
  }

  function gatherFor(entityId: string): GraphFact[] {
    const subjIds = bySubject.get(entityId);
    const objIds = byObject.get(entityId);
    const seen = new Set<number>();
    const out: GraphFact[] = [];
    if (subjIds) {
      for (const id of subjIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        const f = facts.get(id);
        if (f) out.push(f);
      }
    }
    if (objIds) {
      for (const id of objIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        const f = facts.get(id);
        if (f) out.push(f);
      }
    }
    return out;
  }

  return {
    insert(input) {
      const fact: GraphFact = {
        id: nextId++,
        tokens: tokenize(input.summary),
        ...input,
      };
      facts.set(fact.id, fact);
      indexFact(fact);
      return fact;
    },

    recentForEntity(entityId, limit) {
      const merged = gatherFor(entityId);
      merged.sort((a, b) => b.tick - a.tick || b.id - a.id);
      return merged.slice(0, limit);
    },

    search(opts) {
      const limit = opts.limit ?? 8;

      // Build candidate set from the most selective filter we have.
      let candidates: GraphFact[];
      if (opts.entityId) {
        candidates = gatherFor(opts.entityId);
      } else if (opts.kind) {
        const ids = byKind.get(opts.kind);
        candidates = ids ? Array.from(ids).map((id) => facts.get(id)).filter((f): f is GraphFact => !!f) : [];
      } else {
        candidates = Array.from(facts.values());
      }

      if (opts.kind && opts.entityId) {
        candidates = candidates.filter((f) => f.kind === opts.kind);
      }
      if (opts.sinceTick !== undefined) {
        const since = opts.sinceTick;
        candidates = candidates.filter((f) => f.tick >= since);
      }

      const queryTokens = opts.query ? tokenize(opts.query) : [];

      // Compute idf-lite against the candidate set if we have a query.
      const df = new Map<string, number>();
      if (queryTokens.length) {
        for (const f of candidates) {
          const uniq = new Set(f.tokens);
          for (const t of uniq) df.set(t, (df.get(t) ?? 0) + 1);
        }
      }
      const N = Math.max(1, candidates.length);

      // Find latest tick across candidates for recency calc.
      let latestTick = 0;
      for (const f of candidates) if (f.tick > latestTick) latestTick = f.tick;

      const scored: ScoredFact[] = candidates.map((f) => {
        let score = 0;
        if (queryTokens.length) {
          const tokenSet = new Set(f.tokens);
          for (const t of queryTokens) {
            if (tokenSet.has(t)) {
              const idf = Math.log(1 + N / (1 + (df.get(t) ?? 0)));
              score += idf;
            }
          }
        }
        const recency = Math.max(0, 1 - (latestTick - f.tick) / 200);
        score += 0.4 * recency;
        return { ...f, score };
      });

      scored.sort((a, b) => b.score - a.score || b.tick - a.tick);
      return scored.slice(0, limit);
    },

    all() {
      return Array.from(facts.values());
    },

    count() {
      return facts.size;
    },

    ttlPrune(currentTick, ttlTicks, hardCap) {
      const cutoff = currentTick - ttlTicks;
      let removed = 0;
      // Walk insertion order; Map iteration is insertion-ordered. facts.size
      // shrinks as we go, so check it directly — no separate counter math.
      for (const [id, fact] of facts) {
        if (fact.tick < cutoff || facts.size > hardCap) {
          facts.delete(id);
          unindexFact(fact);
          removed += 1;
        } else {
          // Oldest surviving fact is past the cutoff and we're within hardCap.
          break;
        }
      }
      return removed;
    },
  };
}

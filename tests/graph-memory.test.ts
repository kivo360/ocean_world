import { describe, expect, it } from "vitest";
import { createGraphMemory } from "../src/simulation/graph-memory";

describe("graph memory", () => {
  it("inserts and retrieves by entity (subject or object)", () => {
    const g = createGraphMemory();
    g.insert({ tick: 1, kind: "trade", subject: "a", object: "b", summary: "a sold goods to b" });
    g.insert({ tick: 2, kind: "tax", subject: "lk", object: "a", summary: "lk taxed a" });
    g.insert({ tick: 3, kind: "speech", subject: "c", object: "d", summary: "c greeted d" });

    const forA = g.recentForEntity("a", 5);
    expect(forA.length).toBe(2);
    // Newest first: tax(t=2) then trade(t=1)
    expect(forA[0]!.kind).toBe("tax");
    expect(forA[1]!.kind).toBe("trade");

    const forD = g.recentForEntity("d", 5);
    expect(forD.length).toBe(1);
    expect(forD[0]!.kind).toBe("speech");
  });

  it("search filters by kind and recency", () => {
    const g = createGraphMemory();
    for (let i = 0; i < 10; i++) {
      g.insert({ tick: i, kind: "trade", subject: "m", object: `b${i}`, summary: `trade ${i}` });
    }
    g.insert({ tick: 11, kind: "tax", subject: "lk", object: "m", summary: "lk taxed m" });

    const allForM = g.search({ entityId: "m", limit: 100 });
    expect(allForM.length).toBe(11);

    const onlyTrades = g.search({ entityId: "m", kind: "trade", limit: 100 });
    expect(onlyTrades.every((f) => f.kind === "trade")).toBe(true);
    expect(onlyTrades.length).toBe(10);

    const recent = g.search({ entityId: "m", sinceTick: 8, limit: 100 });
    expect(recent.length).toBe(3); // ticks 8, 9, 11
  });

  it("ranks query terms by token overlap with idf", () => {
    const g = createGraphMemory();
    g.insert({ tick: 1, kind: "speech", subject: "a", object: "b", summary: "ledger inspection failed" });
    g.insert({ tick: 2, kind: "speech", subject: "a", object: "c", summary: "hello there friend" });
    g.insert({ tick: 3, kind: "tax", subject: "lk", object: "a", summary: "violation: hoarding" });

    const hits = g.search({ query: "hoarding violation", limit: 3 });
    expect(hits[0]!.kind).toBe("tax");
    expect(hits[0]!.score).toBeGreaterThan(hits[hits.length - 1]!.score);
  });

  it("ttlPrune drops old facts and rebuilds the index correctly", () => {
    const g = createGraphMemory();
    for (let i = 0; i < 100; i++) {
      g.insert({ tick: i, kind: "trade", subject: "m", object: "b", summary: `t${i}` });
    }
    expect(g.count()).toBe(100);

    // Cut off everything older than tick 90 with hardCap 200 (no cap effect).
    const removed = g.ttlPrune(100, 10, 200);
    expect(removed).toBe(90);
    expect(g.count()).toBe(10);

    // Index integrity: searching for "m" should return only the surviving 10.
    const remaining = g.recentForEntity("m", 100);
    expect(remaining.length).toBe(10);
    expect(remaining[0]!.tick).toBe(99);
    expect(remaining[remaining.length - 1]!.tick).toBe(90);
  });

  it("ttlPrune respects hardCap when ttl alone wouldn't trigger", () => {
    const g = createGraphMemory();
    for (let i = 0; i < 50; i++) {
      g.insert({ tick: i, kind: "speech", subject: "x", object: "y", summary: `s${i}` });
    }
    // ttl=1000 means nothing is old enough, but hardCap=20 forces eviction.
    g.ttlPrune(50, 1000, 20);
    expect(g.count()).toBe(20);
    const survivors = g.recentForEntity("x", 100);
    expect(survivors.map((f) => f.tick).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => 30 + i),
    );
  });

  it("entity-restricted search is independent of unrelated facts", () => {
    const g = createGraphMemory();
    g.insert({ tick: 1, kind: "trade", subject: "m", object: "p", summary: "sale" });
    g.insert({ tick: 2, kind: "speech", subject: "z", object: "q", summary: "noise" });
    const hits = g.search({ entityId: "m" });
    expect(hits.length).toBe(1);
    expect(hits[0]!.subject).toBe("m");
  });
});

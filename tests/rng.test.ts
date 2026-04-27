import { describe, it, expect } from "vitest";
import { createRng } from "../src/simulation/rng";

describe("rng", () => {
  it("is deterministic given a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a.next(), a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it("int stays within bounds", () => {
    const r = createRng(1);
    for (let i = 0; i < 100; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

import type { World } from "./world";

export type ReplaySnapshot = {
  tick: number;
  entityStates: Array<{
    id: string;
    x: number;
    y: number;
    energy: number;
    activeBehavior: string;
    phase: string;
    money: number;
    goods: number;
  }>;
  eventKinds: string[];
  speechBubbles: number;
};

export class ReplayRecorder {
  private snapshots: ReplaySnapshot[] = [];

  record(world: World): void {
    this.snapshots.push({
      tick: world.tick,
      entityStates: [...world.entities.values()].map((e) => ({
        id: e.id,
        x: e.components.physical?.x ?? 0,
        y: e.components.physical?.y ?? 0,
        energy: e.components.physical?.energy ?? 0,
        activeBehavior: e.activeBehavior,
        phase: e.state[e.activeBehavior]?.phase ?? "",
        money: e.components.financial?.money ?? 0,
        goods: e.components.financial?.goods ?? 0,
      })),
      eventKinds: world.events.slice(-5).map((ev) => ev.kind),
      speechBubbles: world.speechBubbles.size,
    });
  }

  getSnapshots(): readonly ReplaySnapshot[] {
    return this.snapshots;
  }

  /** Compare two recordings. Returns true if identical. */
  static compare(
    a: ReplayRecorder,
    b: ReplayRecorder,
  ): { match: boolean; diffs: string[] } {
    const sa = a.getSnapshots();
    const sb = b.getSnapshots();
    const diffs: string[] = [];

    if (sa.length !== sb.length) {
      diffs.push(`snapshot count: ${sa.length} vs ${sb.length}`);
    }

    const len = Math.min(sa.length, sb.length);
    for (let i = 0; i < len; i++) {
      const snap = sa[i]!;
      const other = sb[i]!;

      if (snap.tick !== other.tick) {
        diffs.push(`tick[${i}]: ${snap.tick} vs ${other.tick}`);
      }

      if (snap.entityStates.length !== other.entityStates.length) {
        diffs.push(`entity count at tick ${snap.tick}: ${snap.entityStates.length} vs ${other.entityStates.length}`);
      }

      const eLen = Math.min(snap.entityStates.length, other.entityStates.length);
      for (let j = 0; j < eLen; j++) {
        const e = snap.entityStates[j]!;
        const o = other.entityStates[j]!;
        if (e.id !== o.id) {
          diffs.push(`entity[${i}][${j}].id: ${e.id} vs ${o.id}`);
        }
        if (e.x !== o.x) {
          diffs.push(`entity ${e.id} tick ${snap.tick} x: ${e.x} vs ${o.x}`);
        }
        if (e.y !== o.y) {
          diffs.push(`entity ${e.id} tick ${snap.tick} y: ${e.y} vs ${o.y}`);
        }
        if (e.energy !== o.energy) {
          diffs.push(`entity ${e.id} tick ${snap.tick} energy: ${e.energy} vs ${o.energy}`);
        }
        if (e.activeBehavior !== o.activeBehavior) {
          diffs.push(`entity ${e.id} tick ${snap.tick} behavior: ${e.activeBehavior} vs ${o.activeBehavior}`);
        }
        if (e.phase !== o.phase) {
          diffs.push(`entity ${e.id} tick ${snap.tick} phase: ${e.phase} vs ${o.phase}`);
        }
        if (e.money !== o.money) {
          diffs.push(`entity ${e.id} tick ${snap.tick} money: ${e.money} vs ${o.money}`);
        }
        if (e.goods !== o.goods) {
          diffs.push(`entity ${e.id} tick ${snap.tick} goods: ${e.goods} vs ${o.goods}`);
        }
      }

      if (snap.speechBubbles !== other.speechBubbles) {
        diffs.push(`speechBubbles at tick ${snap.tick}: ${snap.speechBubbles} vs ${other.speechBubbles}`);
      }

      if (snap.eventKinds.length !== other.eventKinds.length) {
        diffs.push(`eventKinds length at tick ${snap.tick}: ${snap.eventKinds.length} vs ${other.eventKinds.length}`);
      } else {
        for (let k = 0; k < snap.eventKinds.length; k++) {
          if (snap.eventKinds[k] !== other.eventKinds[k]) {
            diffs.push(`eventKind[${k}] at tick ${snap.tick}: ${snap.eventKinds[k]} vs ${other.eventKinds[k]}`);
          }
        }
      }
    }

    return { match: diffs.length === 0, diffs };
  }
}

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
      eventKinds: world.events.slice(-5).map((e) => e.kind),
      speechBubbles: world.speechBubbles.size,
    });
  }

  getSnapshots(): readonly ReplaySnapshot[] {
    return this.snapshots;
  }

  clear(): void {
    this.snapshots = [];
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
      diffs.push(
        `snapshot count mismatch: ${sa.length} vs ${sb.length}`,
      );
      return { match: false, diffs };
    }

    for (let i = 0; i < sa.length; i++) {
      const as = sa[i]!;
      const bs = sb[i]!;

      if (as.tick !== bs.tick) {
        diffs.push(`tick ${i}: tick mismatch ${as.tick} vs ${bs.tick}`);
      }
      if (as.eventKinds.join(",") !== bs.eventKinds.join(",")) {
        diffs.push(
          `tick ${as.tick}: eventKinds mismatch [${as.eventKinds.join(",")}] vs [${bs.eventKinds.join(",")}]`,
        );
      }
      if (as.speechBubbles !== bs.speechBubbles) {
        diffs.push(
          `tick ${as.tick}: speechBubbles count ${as.speechBubbles} vs ${bs.speechBubbles}`,
        );
      }

      if (as.entityStates.length !== bs.entityStates.length) {
        diffs.push(
          `tick ${as.tick}: entity count ${as.entityStates.length} vs ${bs.entityStates.length}`,
        );
        continue;
      }

      for (let j = 0; j < as.entityStates.length; j++) {
        const ae = as.entityStates[j]!;
        const be = bs.entityStates[j]!;
        if (
          ae.x.toFixed(3) !== be.x.toFixed(3) ||
          ae.y.toFixed(3) !== be.y.toFixed(3) ||
          ae.energy.toFixed(6) !== be.energy.toFixed(6) ||
          ae.activeBehavior !== be.activeBehavior ||
          ae.phase !== be.phase ||
          ae.money !== be.money ||
          ae.goods !== be.goods
        ) {
          diffs.push(
            `tick ${as.tick} entity ${ae.id}: ` +
              `pos=(${ae.x.toFixed(3)},${ae.y.toFixed(3)}) vs (${be.x.toFixed(3)},${be.y.toFixed(3)}) ` +
              `energy=${ae.energy.toFixed(6)} vs ${be.energy.toFixed(6)} ` +
              `behavior=${ae.activeBehavior} vs ${be.activeBehavior} ` +
              `phase=${ae.phase} vs ${be.phase} ` +
              `money=${ae.money} vs ${be.money} ` +
              `goods=${ae.goods} vs ${be.goods}`,
          );
        }
      }
    }

    return { match: diffs.length === 0, diffs };
  }
}

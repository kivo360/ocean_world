import type { ComponentMap } from "./components";

export type Archetype =
  | "Person"
  | "Merchant"
  | "Wanderer"
  | "MarketMaker"
  | "Lawkeeper"
  | "Player";

export type BehaviorName =
  | "Wander"
  | "Trade"
  | "Converse"
  | "Rest"
  | "MarkPrice"
  | "EnforcePolicy"
  | "Gossip";

export type BehaviorState = {
  name: BehaviorName;
  phase: string;
  data: Record<string, number | string | null>;
};

export type Entity = {
  id: string;
  name: string;
  archetype: Archetype;
  components: ComponentMap;
  behaviors: BehaviorName[];
  state: Record<BehaviorName, BehaviorState | undefined>;
  activeBehavior: BehaviorName;
  createdTick: number;
};

export type EntitySnapshot = {
  id: string;
  name: string;
  archetype: Archetype;
  activeBehavior: BehaviorName;
  phase: string;
  x: number;
  y: number;
  energy: number;
  money: number;
  goods: number;
  speechBubble: string | null;
};

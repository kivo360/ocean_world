// Pure-data components. No logic. See docs/02-ecs-data-model.md.

export type PhysicalState = {
  x: number;
  y: number;
  speed: number;
  perceptionRadius: number;
  energy: number;
  destX: number | null;
  destY: number | null;
};

export type Values = {
  profit: number;
  community: number;
  curiosity: number;
  fairness: number;
  autonomy: number;
};

export type CognitiveState = {
  values: Values;
  attentionFocus: string | null;
  workingMemoryLoad: number;
  mood: number; // 0-1, 0.5 neutral. Biases behavior scores.
};

export type FinancialState = {
  money: number;
  goods: number;
  savings: number;
};

export type InventoryState = {
  items: Record<string, number>;
};

export type MemoryEvent = {
  tick: number;
  kind: string;
  source: string;
  target?: string;
  summary: string;
};

export type MemoryLog = {
  recent: MemoryEvent[];
};

export type Perceived = {
  nearbyIds: string[];
  incomingSpeech: Array<{ from: string; msg: string }>;
  tradeOffers: Array<{ from: string; goods: number; price: number }>;
};

export type ComponentMap = {
  physical?: PhysicalState;
  cognitive?: CognitiveState;
  financial?: FinancialState;
  inventory?: InventoryState;
  memory?: MemoryLog;
  perceived?: Perceived;
};

export type ComponentKey = keyof ComponentMap;

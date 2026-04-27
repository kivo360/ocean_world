// Typed actions emitted during the decide phase, resolved by the tick runner.

export type MoveAction = {
  kind: "move_to";
  entityId: string;
  x: number;
  y: number;
};

export type SpeakAction = {
  kind: "speak";
  entityId: string;
  target: string;
  msg: string;
};

export type TradeAction = {
  kind: "trade";
  entityId: string;
  target: string;
  goods: number;
  price: number;
};

export type RestAction = {
  kind: "rest";
  entityId: string;
};

export type NoopAction = {
  kind: "noop";
  entityId: string;
  reason: string;
};

// T3 placeholder per docs/03 — stubbed; resolver falls back to a safe action.
export type NeedsDeliberationAction = {
  kind: "needs_deliberation";
  entityId: string;
  situation: string;
};

export type Action =
  | MoveAction
  | SpeakAction
  | TradeAction
  | RestAction
  | NoopAction
  | NeedsDeliberationAction;

export type WorldEvent = {
  tick: number;
  kind: string;
  source: string;
  target?: string;
  summary: string;
};

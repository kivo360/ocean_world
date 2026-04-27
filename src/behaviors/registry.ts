import type { BehaviorRegistry } from "./behavior";
import { Converse } from "./converse";
import { EnforcePolicy } from "./enforce-policy";
import { Gossip } from "./gossip";
import { MarkPrice } from "./mark-price";
import { Rest } from "./rest";
import { Trade } from "./trade";
import { Wander } from "./wander";

export const REGISTRY: BehaviorRegistry = {
  Wander,
  Converse,
  Trade,
  Rest,
  MarkPrice,
  EnforcePolicy,
  Gossip,
};

import type { BehaviorRegistry } from "./behavior";
import { AvoidLawkeepers } from "./avoid-lawkeepers";
import { Converse } from "./converse";
import { EnforcePolicy } from "./enforce-policy";
import { GroupUp } from "./group-up";
import { MarkPrice } from "./mark-price";
import { MerchantCoordination } from "./merchant-coordination";
import { PursueViolators } from "./pursue-violators";
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
  GroupUp,
  AvoidLawkeepers,
  PursueViolators,
  MerchantCoordination,
};

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OntologyRegistry } from "../ontology/registry";
import type { Domain, ComponentDoc, BehaviorDoc } from "../ontology/types";
import type { RejectedStore } from "./rejected-store";
import type { RAGContext, Strategy } from "./types";

export type RagOptions = {
  seedsDir?: string;
  recentLimit?: number;
  siblingLimit?: number;
  rejectedLimit?: number;
};

const DOMAIN_SIBLINGS: Record<Domain, Domain[]> = {
  economic: ["organizational", "environmental"],
  social: ["cognitive", "organizational"],
  cognitive: ["social"],
  governance: ["organizational", "social"],
  environmental: ["economic"],
  organizational: ["economic", "social", "governance"],
};

export async function assembleRag(
  registry: OntologyRegistry,
  rejectedStore: RejectedStore,
  domain: Domain,
  strategy: Strategy,
  opts: RagOptions = {},
): Promise<RAGContext> {
  const recentLimit = opts.recentLimit ?? 15;
  const siblingLimit = opts.siblingLimit ?? 10;
  const rejectedLimit = opts.rejectedLimit ?? 5;
  const seedsDir = opts.seedsDir ?? "./ontology/seeds";

  const existing = registry.listRecentInDomain(domain, recentLimit);

  const siblingDomains = DOMAIN_SIBLINGS[domain] ?? [];
  const siblings: Array<ComponentDoc | BehaviorDoc> = [];
  if (siblingDomains.length > 0) {
    const perDomain = Math.ceil(siblingLimit / siblingDomains.length);
    for (const sd of siblingDomains) {
      const { components, behaviors } = registry.listByDomain(sd);
      siblings.push(...components.slice(0, perDomain));
      siblings.push(...behaviors.slice(0, perDomain));
      if (siblings.length >= siblingLimit) break;
    }
  }

  const rejected = rejectedStore.recentInDomain(domain, rejectedLimit).map((r) => ({
    name: r.name,
    kind: r.kind,
    reason: r.reason,
  }));

  const seeds = await loadSeeds(seedsDir);

  return {
    domain,
    strategy,
    existing,
    siblings: siblings.slice(0, siblingLimit),
    rejected,
    seeds,
  };
}

async function loadSeeds(seedsDir: string): Promise<RAGContext["seeds"]> {
  const readSafe = async (file: string) => {
    try {
      return await readFile(join(seedsDir, file), "utf-8");
    } catch {
      return "";
    }
  };
  const [domains, schemaOrgActions, verbnetClasses] = await Promise.all([
    readSafe("domains.yaml"),
    readSafe("schema-org-actions.yaml"),
    readSafe("verbnet-classes.yaml"),
  ]);
  return { domains, schemaOrgActions, verbnetClasses };
}

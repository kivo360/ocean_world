// Runtime ontology registry — stores loaded docs and supports hot-insertion
// of accepted concepts from the D5 ontology builder.

import type {
  ArchetypeDoc,
  BehaviorDoc,
  ComponentDoc,
  Domain,
  HierarchyDoc,
  OntologyBundle,
} from "./types";

export type OntologyRegistry = {
  getBundle(): OntologyBundle;
  getComponent(id: string): ComponentDoc | undefined;
  getBehavior(id: string): BehaviorDoc | undefined;
  getArchetype(id: string): ArchetypeDoc | undefined;
  addComponent(doc: ComponentDoc): void;
  addBehavior(doc: BehaviorDoc): void;
  addArchetype(doc: ArchetypeDoc): void;
  addHierarchy(doc: HierarchyDoc): void;
  listByDomain(domain: Domain): {
    components: ComponentDoc[];
    behaviors: BehaviorDoc[];
  };
  listRecentInDomain(
    domain: Domain,
    limit: number,
  ): Array<ComponentDoc | BehaviorDoc>;
  counts(): { components: number; behaviors: number; archetypes: number };
  fillRatios(targets: Record<Domain, number>): Record<Domain, number>;
};

export function createRegistry(initial: OntologyBundle): OntologyRegistry {
  const components = new Map<string, ComponentDoc>();
  const behaviors = new Map<string, BehaviorDoc>();
  const archetypes = new Map<string, ArchetypeDoc>();
  const hierarchies = new Map<string, HierarchyDoc>();
  // Insertion order is preserved by Map, so "recent" = last-added.

  for (const c of initial.components) components.set(c["@id"], c);
  for (const b of initial.behaviors) behaviors.set(b["@id"], b);
  for (const a of initial.archetypes) archetypes.set(a["@id"], a);
  for (const h of initial.hierarchies) hierarchies.set(h["@id"], h);

  return {
    getBundle(): OntologyBundle {
      return {
        components: [...components.values()],
        behaviors: [...behaviors.values()],
        archetypes: [...archetypes.values()],
        hierarchies: [...hierarchies.values()],
      };
    },
    getComponent: (id) => components.get(id),
    getBehavior: (id) => behaviors.get(id),
    getArchetype: (id) => archetypes.get(id),
    addComponent(doc) {
      components.set(doc["@id"], doc);
    },
    addBehavior(doc) {
      behaviors.set(doc["@id"], doc);
    },
    addArchetype(doc) {
      archetypes.set(doc["@id"], doc);
    },
    addHierarchy(doc) {
      hierarchies.set(doc["@id"], doc);
    },
    listByDomain(domain) {
      return {
        components: [...components.values()].filter((c) => c.domain === domain),
        behaviors: [...behaviors.values()].filter((b) => b.domain === domain),
      };
    },
    listRecentInDomain(domain, limit) {
      const componentList = [...components.values()].filter((c) => c.domain === domain);
      const behaviorList = [...behaviors.values()].filter((b) => b.domain === domain);
      const all: Array<ComponentDoc | BehaviorDoc> = [...componentList, ...behaviorList];
      return all.slice(-limit).reverse();
    },
    counts() {
      return {
        components: components.size,
        behaviors: behaviors.size,
        archetypes: archetypes.size,
      };
    },
    fillRatios(targets) {
      const result = {} as Record<Domain, number>;
      for (const domain of Object.keys(targets) as Domain[]) {
        const inDomain =
          [...components.values()].filter((c) => c.domain === domain).length +
          [...behaviors.values()].filter((b) => b.domain === domain).length;
        result[domain] = targets[domain] > 0 ? inDomain / targets[domain] : 0;
      }
      return result;
    },
  };
}

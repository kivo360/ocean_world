# Ontology internals

## Codegen path
Source of truth: `ontology/components/*.jsonld`, `ontology/behaviors/*.jsonld`, `ontology/archetypes/*.jsonld`.

Run `npm run ontology:codegen` → `scripts/codegen.ts` → `loadOntology()` → `writeGeneratedOntology()` → emits `ontology/generated/{archetypes,behaviors,components}.ts`.

**Never edit `ontology/generated/` by hand** — overwritten on every run. Also writes a dated SHA-256 snapshot to `ontology/snapshots/` (capped at 50, oldest pruned automatically).

## Where to add things
- **New component**: add `ontology/components/MyComponent.jsonld` with `fields`, `category`, `domain`. Re-run codegen. Wire the TS type in `src/simulation/components.ts` manually — codegen emits metadata interfaces, not the runtime component map.
- **New behavior**: add `ontology/behaviors/MyBehavior.jsonld` with `required_components`, `reads`, `writes`, `state_machine`. Add the implementation in `src/behaviors/` and register in `src/behaviors/registry.ts`.
- **New archetype**: add `ontology/archetypes/MyArchetype.jsonld`. Also add the string literal to `Archetype` union in `src/simulation/entity.ts` and entries in `src/renderer/theme.ts`.

## Oxigraph reasoner gating
The reasoner (`src/ontology/oxigraph-reasoner.ts`) is optional at runtime. Always check `reasoner.status().loaded` before calling query methods — it loads async and may never load in test/offline mode. When unloaded, all guardrail checks in `tick.ts` are silently skipped.

`canEntityRunBehavior({ archetype, componentKeys }, behaviorIri)` checks `required_components` at runtime. `componentsRequiredBy(behaviorIri)` returns the missing list for violation messages.

## `required_components` vs `reads` / `writes`
- `required_components`: enforced at runtime by the reasoner. Missing → entity gets `noop` that tick.
- `reads` / `writes`: documentation only today; not enforced. Used in snapshots for future static analysis.

## `context.jsonld` prefix
`ecs:` expands to `https://ocean-world.local/ontology/`. All ids and `required_components` values must use this prefix or the reasoner won't match them.

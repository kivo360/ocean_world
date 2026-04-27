# Ocean World

A multi-tier 2D simulation populated mostly by bots that talk, trade,
remember each other, and gradually develop their own ontology of values,
norms, and factions. The long-term aim is a video-game version of "Mirror
Fish" — a world that ingests real-world signals, makes predictions on
them, folds the predictions back into NPC value functions, and lets that
loop change how the world operates.

> **Status:** early prototype. ECS + T1/T2/T3 tick loop, PixiJS sprite
> renderer, SurrealDB cross-entity graph memory, and Oxigraph SPARQL
> ontology gating are all live. Map system, predictive cognition, and
> MMO substrate are next. See `ROADMAP.md`.

![screenshot placeholder — run `npm run dev` to see the live world](public/sprites/atlas.png)

## Quickstart

```sh
npm install
cp .env.example .env.local      # optional — fill FIREWORKS_API_KEY for live LLM
npm run dev                     # http://localhost:5173
```

Controls: **WASD/arrows** to walk, **E** to greet the nearest NPC, **Y** to
accept a pending trade offer.

Without an API key the simulation runs fully offline with deterministic
stand-ins for T3 deliberation.

## Architecture

- `src/simulation/` — ECS, T1/T2/T3 tick loop, behaviors, archetypes
- `ontology/` + `src/ontology/` — components, behaviors, hierarchies
  (codegen feeds into Oxigraph SPARQL reasoner gating)
- `src/renderer/` — PixiJS stage with animated sprite atlas
- `src/llm/`, `src/sandbox-agent/` — T3 deliberation (Fireworks Kimi router)
- `src/storage/` — SurrealDB cross-entity graph memory ("who taxed me, who I sold to" recall)
- `tools/sprite-forge/` — CLI that composites LPC layers and packs them into a texture atlas

Deeper: `docs/architecture.md`.

## Sprite atlas

Character art is composited at build time by `tools/sprite-forge` from
[Universal LPC Spritesheet](https://github.com/jrconway3/Universal-LPC-spritesheet)
layers. The pipeline:

1. `pull-lpc` (planned, see `docs/quick-wins-10.md` #89) fetches a curated
   set of LPC files into `tools/sprite-forge/fixtures/lpc-real/`
2. `compose` layers them per character config
3. `pack` packs the composed sprites into `public/sprites/atlas.png`
   plus `public/sprites/manifest.json`

A pre-built atlas is committed so `npm run dev` works on first clone.

```sh
cd tools/sprite-forge
npm install
npm run build
node dist/cli.js compose --config examples/archetypes.json \
  --lpc-assets fixtures/lpc-real --output out/composed
node dist/cli.js pack --input out/composed --output ../../public/sprites
```

The `compose` and `pack` steps cache by content hash — re-runs with the
same inputs are ~13× faster.

## Tests

```sh
npm run typecheck
npm test
```

## Roadmap

- `ROADMAP.md` — strategic stages 0–9 (player, region-gating, real-world
  feeds, predictive cognition, recursive worlds, multi-tier, MMO)
- `docs/roadmap-100.md` — tactical 100-item breakdown by phase
- `docs/plan-phase-1.md` — detailed plan for the next 6 visual-polish items
- `docs/quick-wins-10.md` — 10 Phase-1-independent quick wins, parallel-safe

## License

- Code: MIT — see [`LICENSE`](LICENSE)
- Sprite assets composited from LPC: CC-BY-SA 3.0 / GPL 3.0 — see [`CREDITS.md`](CREDITS.md)

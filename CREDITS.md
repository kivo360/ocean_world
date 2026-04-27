# Credits

## Sprite art

The character sprites under `public/sprites/atlas.png` are composited from
layers in the [Universal LPC Spritesheet](https://github.com/jrconway3/Universal-LPC-spritesheet)
fork by **jrconway3**, originally created for the
[Liberated Pixel Cup](https://lpc.opengameart.org/) — a community project
with many contributors. The full attribution list is in the source repo's
[`AUTHORS.txt`](https://github.com/jrconway3/Universal-LPC-spritesheet/blob/master/AUTHORS.txt).

These assets are dual-licensed; recipients may pick either:

- [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- [GPL 3.0](https://www.gnu.org/licenses/gpl-3.0.html)

The composite atlas at `public/sprites/atlas.png` and its manifest at
`public/sprites/manifest.json` are therefore derivative works and inherit
these license terms. If you redistribute this repo or build on these
assets, you must:

1. Credit the original LPC contributors (this file does so).
2. Make derivatives available under the same dual licenses.

The original LPC layer files are not committed to this repository; run
`cd tools/sprite-forge && npm run pull-lpc` (planned in
`docs/quick-wins-10.md` #89) to fetch them locally.

## Open-source libraries

This project stands on the shoulders of:

- [PixiJS 8](https://pixijs.com/) — WebGL renderer
- [React 19](https://react.dev/) — UI
- [Vite](https://vite.dev/) — dev server + bundler
- [SurrealDB](https://surrealdb.com/) (browser WASM) — cross-entity graph memory
- [Oxigraph](https://github.com/oxigraph/oxigraph) — SPARQL reasoner
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) — LLM client
- [sharp](https://sharp.pixelplumbing.com/) — image compositing in `tools/sprite-forge`
- [maxrects-packer](https://github.com/Soimy/maxrects-packer) — atlas packing
- [commander](https://github.com/tj/commander.js) — CLI framework
- [Vitest](https://vitest.dev/) — testing
- [Fireworks AI](https://fireworks.ai/) — Kimi-K2 router for T3 deliberation

## LLM-assisted development

Significant portions of the code were written with [Claude Code](https://claude.com/claude-code).
Architecture, design choices, and review were directed by Kevin Hill.

# Handover – milestone "Phases 0–6 (partial)"

## Completed
See FEATURE-MATRIX.md (authoritative). In short: Phase 1 fully; Phase 2 except appearance/stroke expansion/grid; Phase 3 engine (HarfBuzz) with panel-based editing; Phase 4 PNG/JPEG/SVG/PDF + bleed + presets; Phase 5 image trace only; Phase 6 actions/CLI/plugin API.

## Verified tests
`npm run typecheck && npm run lint && npm test && npm run test:e2e` green; `xvfb-run -a npm run test:electron` and `npm run test:cli` OK. Counts in PROJECT-STATUS.md. **Nothing has been run on Windows.**

## How to resume
```bash
npm install
npm test               # Node unit/interaction/renderer/PDF tests (PDF tests need poppler-utils)
npm run test:e2e       # builds, serves, drives real Chromium (/opt/pw-browsers/chromium if present)
npm run dev            # Vite dev server
npm start              # build + Electron window (needs a display)
npm run test:cli       # build headless exporter + smoke test
```
Test hooks: `window.__vs.workspace` (read-only inspection), `window.__vsFontsReady` (promise).

## Architecture changes to know
* Format **v2** (compound paths, text, gradients, guides, clip groups). `schema.ts` migrates v1; keep adding migrations there.
* **Text is outlines** from HarfBuzz (ADR-009): anything that works on shapes (`elementSubpaths`) works on text. `layoutText` caches per element object and `fonts.version`.
* `Paint` is `solid | linear | radial`; **stroke paint is solid only**.
* Booleans/PDF/export all consume `elementSubpaths(el)`; keep that the single way to get geometry.
* Electron loads `app://vs/index.html` (not file://); do not weaken the CSP beyond `'wasm-unsafe-eval'`.
* `History.restoreBase()` for absolute-from-start drags; tools call `begin → restoreBase/update* → commit`.
* All user actions go through `src/ui/commands.ts` → `Editor` methods → `core` commands.

## Gotchas discovered
* Playwright `filechooser.setFiles` fails silently when the test title (hence output path) has non-ASCII characters. Keep e2e titles ASCII.
* ESLint 10 flat config; `react-hooks` plugin is not installed (do not add `eslint-disable react-hooks/*`).
* `harfbuzzjs` has no `package.json` export; its WASM URL is resolved by Vite via `import.meta.url`.
* In the agent environment, escape sequences like `﻿` typed in shell heredocs can be turned into raw characters; use `String.fromCodePoint`/numeric ranges in source.
* Poppler anti-aliasing differs slightly from canvas; PDF comparisons use a ≤ 1–2 % tolerance plus exact interior-pixel checks.

## Known bugs / unfinished
KNOWN-ISSUES.md is authoritative. Biggest: no Windows verification, no colour management, text editing only via panel, no appearance stack.

## Next priorities
NEXT-TASKS.md (1 Windows verification, 2 colour management, 3 on-canvas text editing).

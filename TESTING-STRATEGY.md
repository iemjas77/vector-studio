# Testing strategy

## Layers
1. **Unit (Vitest, Node)** – geometry math, document ops, history, schema validation, SVG parse/emit, renderer pixels, editor interactions, performance budgets. `npm test` (≈3 s).
2. **Renderer pixel tests (Node)** – `@napi-rs/canvas` renders documents; PNG decoded with `pngjs`; exact pixel/alpha assertions for edges, transparency, clipping, group opacity, 4500×5400 export.
3. **Editor interaction tests (Node, no DOM)** – drive tools with `pointerDown/Move/Up`, assert exact geometry and undo behavior.
4. **End-to-end (Playwright + real Chromium)** – real mouse/keyboard, menus, panels, real file download/upload, real PNG/SVG files read back from disk. `npm run test:e2e`.
5. **Electron smoke** – real Electron main/preload under Xvfb: launch, draw, native save (dialog mocked), verify file. `xvfb-run -a npm run test:electron`. **Linux only so far.**

## What is covered (see FEATURE-MATRIX.md for per-feature status)
Complex Beziers (loops, degenerates, exact bounds), malformed files (truncated JSON, wrong types, duplicate ids, future versions, bad SVG paths), undo/redo sequences (random 200-step property test, transactions, redo clearing, dirty flag, stack limit), large documents (20k elements; render/hit-test/serialize budgets), export correctness (exact pixel size, alpha, shape edges within the pointer-mapping tolerance).

## Not covered yet
* Windows runs of anything (no Windows machine available in this environment).
* Visual-regression screenshots of the full UI (baselines would be OS/font-specific; planned once the UI stabilises).
* High-DPI/multi-monitor behavior is implemented (DPR-aware canvas, DPR-change listener) but only exercised at DPR 1.
* Accessibility audit, IME/text input, touch/pen pressure.

## Rules
A feature is "done" only with an automated test that fails if it breaks. Bugs found get a regression test first. Commit only with typecheck, lint, unit and e2e green.

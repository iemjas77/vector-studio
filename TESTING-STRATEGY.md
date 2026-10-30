# Testing strategy

## Layers
1. **Unit / interaction (Vitest, Node)** – geometry, document ops, history, schema + migration, SVG parse/emit, text layout, booleans, cleanup, automation, renderer pixels, editor tools via simulated pointer events, performance budgets. `npm test` (≈ 6 s).
2. **Renderer pixel tests** – `@napi-rs/canvas` renders documents; exact pixel/alpha assertions (edges, transparency, clipping, gradients, group opacity, 4500×5400).
3. **PDF verification** – our PDF is rasterised with poppler (`pdftoppm`) and compared with our canvas renderer; `pdfinfo` checks page/Trim/Bleed boxes.
4. **End-to-end (Playwright + real Chromium)** – real mouse/keyboard, menus, panels, dialogs, real file download/upload, real PNG/JPEG/PDF/SVG files read back. Includes an **SVG interop test**: Chromium's own SVG engine draws our exported SVG and is compared pixel-wise with our renderer. `npm run test:e2e`.
5. **Electron smoke** – real Electron under Xvfb: launch, draw, text via HarfBuzz WASM over `app://`, system-font scan, native save (dialog mocked). `xvfb-run -a npm run test:electron`.
6. **CLI smoke** – builds the CLI, batch-exports resized transparent PNGs with text. `npm run test:cli`.

## Edge cases covered
Complex Beziers (loops, degenerate), malformed `.vstudio` and SVG, duplicate ids, future versions, v1 migration, 200-step random undo/redo, 20k-element documents, boolean tangent/coincident/identical/disjoint/hole cases, hit-testing with transforms/holes/clips, RTL and fallback text, text on closed/open paths, export size limits, invalid batch input, path-traversal in font reads.

## Not covered
* **Windows** – nothing has been run there.
* Full-UI screenshot regression (baselines are OS/font specific).
* High-DPI / multi-monitor at DPR ≠ 1.
* Accessibility audit, IME input, touch/pen.
* Native-speaker review of non-Latin text rendering.

## Rules
A feature is done only with an automated test that fails when it breaks. Bugs get a regression test first. Commit only with typecheck, lint, unit and e2e green; run Electron and CLI smoke tests when touching `electron/`, text, export or `cli/`.

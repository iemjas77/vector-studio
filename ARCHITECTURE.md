# Architecture

Vector Studio is a layered desktop app. Lower layers never import upper layers. This is enforced by an ESLint rule on `src/core/**` and by the fact that the document engine, the editor controller, the exporters and the batch runner all run in plain Node with no DOM.

```
┌───────────────────────────── electron/ ─────────────────────────────┐
│ main.cjs   window, app:// protocol (needed for WASM fetch), native  │
│            dialogs, close confirmation, font scan (fonts.cjs)       │
│ preload.cjs  tiny contextBridge: files, fonts                       │
└──────────────▲──────────────────────────────────────────────────────┘
               │ window.vsElectron (absent in a plain browser)
┌──────────────┴──────────── src/ui (React) ──────────────────────────┐
│ App, MenuBar, Toolbar, CanvasView, panels, dialogs, commands.ts     │
│ fonts-boot.ts, export-presets.ts, templates.ts                      │
└──────────────▲───────────────────────────────────────▲──────────────┘
               │ src/platform (Electron | browser)     │
┌──────────────┴──── src/editor ────┐  ┌────────────────┴─ src/render ─┐
│ Editor: selection, viewport,      │  │ canvas2d.ts (views + export)  │
│ tools (select, direct, shapes,    │  │ export.ts (raster, bleed)     │
│ pen, text, view), snapping,       │  │ overlay.ts (selection chrome, │
│ guides, isolation, clipboard      │  │ rulers, guides)               │
│ NO DOM                            │  └───────────────▲───────────────┘
└──────────────▲────────────────────┘                  │
               │                                       │
┌──────────────┴──────────── src/core (pure TS) ───────┴───────────────┐
│ document/  model, schema(zod)+migration, ops, history, query, boolean │
│            (Paper.js), arrange, cleanup, paint, factory               │
│ geometry/  matrix, bezier, path                                       │
│ text/      fonts registry, HarfBuzz layout (shaping, bidi, fallback,  │
│            wrapping, text on path)                                    │
│ io/        svg-import/export, svg-path, pdf-export, trace, image-meta,│
│            export-check, colors                                       │
└──────────────▲───────────────────────────────────────────────────────┘
               │
┌──────────────┴─ src/automation + cli ────────────────────────────────┐
│ actions (JSON action lists), batch (size variants), plugin API       │
│ cli/batch.ts + main.ts: headless exporter (Node, @napi-rs/canvas)    │
└──────────────────────────────────────────────────────────────────────┘
```

## Document Core (`src/core/document`)
* **Model** (`types.ts`): `VDocument { artboards[], layers[], guides? }`; a layer holds elements; an element is `rect | ellipse | path | text | group` with `id, name, visible, locked, opacity, transform` (affine `[a b c d e f]`). Shapes carry `fill` (solid, linear or radial gradient in bounding-box units) and `stroke` (solid; width/cap/join/miter/dash). Paths have a primary subpath plus `extra` subpaths (compound path) and a `fillRule`. Groups may be clipping masks (`clip`: top-most child is the mask). Handles are stored **relative** to anchors.
* **Immutability**: documents are immutable values updated through immer. `History` keeps snapshot references (structural sharing), supports gesture transactions (`begin/update/restoreBase/commit/cancel`), dirty tracking, 500 steps.
* **Commands** (`ops.ts`, `boolean.ts`, `arrange.ts`, `cleanup.ts`) are plain functions over an immer draft. The UI never mutates documents directly, and automation calls the same functions.
* **Format** (`schema.ts`, `serialize.ts`): JSON, `format: "vector-studio"`, integer `version` (now **2**; v1 files are migrated on load). Strict validation with readable errors. Extension `.vstudio`.

## Vector Geometry (`src/core/geometry`)
Matrices; cubic Beziers (exact bounds, split, flatten, nearest point); path editing primitives; winding number (non-zero and even-odd). Booleans use **Paper.js** (`document/boolean.ts`), fed with world-space Bezier data and converted back to compound paths.

## Text (`src/core/text`)
Text is an editable object (`TextElement`) but is **shaped with HarfBuzz and drawn as outlines**, so canvas, SVG, PDF, boolean ops and "Create Outlines" all use the same glyph geometry. `fonts.ts` is a registry of loaded faces (bundled Inter, system fonts from Electron's font scan or the browser's Local Font Access) with best-match resolution and fallback families. `layout.ts` does: line/paragraph split, greedy word wrap with real shaped widths, per-glyph tracking, alignment, simplified bidi (RTL runs), per-run font fallback for missing glyphs, synthetic italic, and text on a path (glyphs placed by arc length and rotated with the tangent). Results are cached per element object and invalidated when fonts load.

## Rendering (`src/render`)
One **Canvas2D** renderer (`canvas2d.ts`) written against `CanvasRenderingContext2D`, so the same code draws the editor view, PNG/JPEG export in the app, and renders in Node (`@napi-rs/canvas`) for tests and the CLI. Supports transforms, fill/stroke, gradients, even-odd/non-zero, clipping masks, group opacity as a composited unit, culling, isolation-mode dimming and a checkerboard for transparent artboards. Selection chrome, rulers and guides are drawn separately (`overlay.ts`).

## Export (`src/core/io`, `src/render/export.ts`)
* **PNG/JPEG**: rasterise an artboard (+ optional bleed) at a size/scale; ppi is written into the file (pHYs / JFIF); JPEG is flattened onto a colour.
* **SVG**: layers, groups, transforms, gradients (defs), clipPaths; text exported as outlines.
* **PDF**: own vector writer (PDF 1.4, uncompressed): one page per artboard, compound paths, dashes, gradients via shading patterns, clipping, TrimBox/BleedBox. RGB only.
* **Pre-flight** (`export-check.ts`): empty artboard, content cut off, transparency, JPEG flattening notes.

## Editor controller (`src/editor`)
`Editor` owns history, selection (objects and, for direct selection, node indices), viewport, clipboard, active tool, rulers/guides/snapping and isolation mode. Tools receive pointer events in document space, manipulate the document through history transactions, and expose overlay data. Tests drive tools with `pointerDown/Move/Up`.

## UI (`src/ui`)
React + Tailwind v4 + zustand (UI-only state). A single **command registry** (`commands.ts`) feeds menus, shortcuts and the shortcuts dialog. `Workspace` manages document tabs. Panels: Properties, Color (with gradient editor), Stroke, Typography, Align, Layers, Artboards. Plugins add menu entries (see `docs/AUTOMATION.md`).

## Automation (`src/automation`, `cli`)
JSON action lists (`cleanup`, `reduceColors`, `replaceColor`, `resizeArtboard`, `setBackground`, `setPpi`), batch size variants, a plugin API, and a headless CLI that runs the same code as the app. Details: `docs/AUTOMATION.md`.

## Platform (`src/platform`, `electron/`)
Hides the host: Electron (native dialogs, system fonts via IPC, `app://vs/` protocol so `fetch()` of the HarfBuzz WASM works under a strict CSP) or browser (file input/download; used for development and the Playwright suite).

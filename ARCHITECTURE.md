# Architecture

Vector Studio is a layered desktop app. Lower layers never import upper layers; this is enforced by an ESLint rule on `src/core/**` and by the fact that the whole core + editor test suite runs in plain Node with no DOM.

```
┌──────────────────────────── electron/ ───────────────────────────┐
│ main.cjs (window, native file dialogs, close confirmation)       │
│ preload.cjs (tiny contextBridge: openTextFile / saveFile)        │
└───────────────▲──────────────────────────────────────────────────┘
                │ window.vsElectron (absent in a plain browser)
┌───────────────┴────────── src/ui (React) ────────────────────────┐
│ App, MenuBar, Toolbar, CanvasView, panels, dialogs, commands.ts   │
│ platform/ (Electron or browser file access)                       │
└───────────────▲───────────────────────▲──────────────────────────┘
                │                       │
┌───────────────┴──── src/editor ───┐  ┌┴──── src/render ───────────┐
│ Editor (selection, viewport,      │  │ canvas2d.ts: draws a        │
│ tools, clipboard, commands on the │  │ document to any Canvas2D    │
│ document) – NO DOM                │  │ context; export.ts: raster  │
│ tools/: select, direct, shapes,   │  │ export; overlay.ts: chrome  │
│ pen, view                         │  └──────────────▲─────────────┘
└───────────────▲───────────────────┘                 │
                │                                     │
┌───────────────┴──────────── src/core (pure TS) ─────┴─────────────┐
│ document/  model, schema (zod), factory, query, ops, history      │
│ geometry/  matrix, bezier, path                                   │
│ io/        svg-import, svg-export, svg-path, colors               │
└───────────────────────────────────────────────────────────────────┘
```

## Document Core (`src/core/document`)
* **Model** (`types.ts`): `VDocument { artboards[], layers[] }`; a layer holds elements; an element is `rect | ellipse | path | group` with `id, name, visible, locked, opacity, transform` (affine `[a b c d e f]`), and `fill`/`stroke` for shapes. Paths are lists of nodes with handles stored **relative** to the anchor, so moving an anchor moves its handles. Rect/ellipse stay "live" (their own parameters) until a node is edited, then become paths.
* **Immutability**: documents are immutable values updated through immer. `History` keeps snapshot references (structural sharing keeps them cheap), supports one-gesture-one-undo-step transactions (`begin/update/commit/cancel/restoreBase`), dirty tracking and a limit of 500 steps.
* **Commands** (`ops.ts`) are plain functions over an immer draft (`addElement`, `transformWorld`, `groupElements`, `reorder`, `moveElement`, …). The UI never mutates documents directly.
* **Format** (`schema.ts`, `serialize.ts`): JSON with `format: "vector-studio"` and an integer `version`; validated on load with zod; rejects wrong format, newer versions, duplicate ids, non-finite numbers and wrong types with readable messages. Native extension: `.vstudio`.

## Vector Geometry (`src/core/geometry`)
Matrices; cubic Bezier evaluation, de Casteljau split, exact bounds (derivative roots), adaptive flattening, nearest-point; path ops: bounds, point-in-polygon (non-zero), insert node preserving shape, toggle smooth/corner, rect/ellipse → nodes (κ=0.5523 circle approximation, max error 0.03 %), SVG path data emission.
*Not yet implemented:* booleans, stroke expansion, intersections, compound paths, snapping.

## Rendering (`src/render`)
One **Canvas2D** renderer, written against the `CanvasRenderingContext2D` interface, so identical code draws the editor view, exports PNG in the app, and renders in Node tests via `@napi-rs/canvas`. It supports transforms, fill/stroke (cap/join/miter/dash), alpha, group opacity as a composited unit (offscreen layer), artboard clipping, bounds-based culling (cached per immutable element), and a checkerboard for transparent artboards. Selection chrome is drawn separately in screen space (`overlay.ts`). See ADR-002 for why not CanvasKit yet.

## Editor controller (`src/editor`)
`Editor` owns history, selection (object ids and, for direct selection, node indices), viewport, clipboard and the active tool. Tools receive pointer events already converted to document space (`PointerInfo`), manipulate the document through history transactions, and expose overlay data. Because there is no DOM, tests simulate real drags (`pointerDown/Move/Up`) and assert exact geometry.

## UI (`src/ui`)
React + Tailwind v4 + zustand (UI-only state such as dialogs/toasts). A single **command registry** (`commands.ts`) feeds menus, shortcuts and the shortcuts dialog, so menu items cannot drift from keybindings and disabled states come from one place. `Workspace` manages document tabs, each with its own `Editor`. Panels: Properties, Color, Stroke, Layers, Artboards.

## Platform
`platform/` hides the host: Electron (native dialogs through IPC) or browser (file input / download). The browser path exists for development and for the Playwright suite.

## Extension points planned
Automation (batch/scripting/plugins) will drive the same command functions the UI uses; no UI code is needed to run them, which is why the editor controller and core are DOM-free.

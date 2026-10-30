# Changelog

## 0.2.0 – Phase 2–6 work (unreleased)
### Added
* **Compound paths** (file format v2, v1 migrated on load), fill rules, make/release.
* **Boolean operations** (Paper.js): unite, minus front, intersect, exclude.
* **Clipping masks**, **gradients** (linear/radial, stops, alpha; SVG import/export, PDF shadings), **align/distribute**, **rulers, guides and snapping**, **isolation mode**.
* **Typography**: HarfBuzz shaping, bundled Inter + system fonts (Electron scan / Local Font Access), Type tool, Typography panel, area text, tracking/leading/alignment, RTL runs, fallback fonts, text on path, Create Outlines.
* **Export**: JPEG, PDF (vector, multi-page, TrimBox/BleedBox), bleed, ppi metadata in PNG/JPEG, presets (print-on-demand T-shirt, web, JPEG, PDF, SVG), all-artboards export, pre-flight checks.
* **Print-on-demand tools**: templates with guides (T-shirt 4500×5400 @ 300 ppi etc.), vector clean-up, colour reduction/replacement, batch resize & export, image tracing.
* **Automation**: JSON action lists, headless batch CLI (`npm run build:cli`), plugin API with one bundled plugin.
* Electron: `app://vs/` protocol (WASM fetch), system font scan, batch save to a folder, binary open.
* Tests: 210 unit/interaction, 37 browser end-to-end (including SVG interop against Chromium), PDF checks with poppler, Electron and CLI smoke tests.
### Fixed during development (regression tests added)
* Layers drag-and-drop disabled for top-level rows; drop landed one slot off.
* Dialog Escape handling; file-chooser "cancel" race on open.
* Group/ungroup, duplicate and alt-drag crashes when working on immer drafts.
* SVG `style="opacity"` ignored.

## 0.1.0 – Phase 0 + Phase 1 (unreleased)
### Added
* Document core: scene graph (artboards, layers, groups, rect/ellipse/path), immutable updates, snapshot undo/redo with gesture transactions, versioned `.vstudio` format with strict validation.
* Vector geometry: matrices, cubic Beziers (exact bounds, split, flatten, nearest point), path editing primitives.
* Renderer: Canvas2D (shared by editor, export and tests), transparent artboards, group opacity, culling.
* Tools: Selection (move/scale/rotate/copy), Direct Selection (anchors, handles, segments), Rectangle, Ellipse, Pen, Hand, Zoom.
* Workspace: menus, document tabs, toolbar, options bar, Properties/Color/Stroke/Layers/Artboards panels, status bar, dialogs (New, Export PNG, Shortcuts, About), keyboard shortcuts.
* I/O: SVG import (with warnings for unsupported features) and export; PNG export (scale/width/transparent, per artboard); native save/open.
* Electron shell (main/preload, native dialogs, close confirmation) – verified on Linux only.
* Test suites: 112 unit/interaction tests, 23 browser end-to-end tests, Electron smoke test.
### Fixed during development (each has a regression test)
* Duplicating inside a drag crashed (copying an immer draft).
* Alt-drag copies were discarded on every pointer move.
* Moving an object within a layer by drag-and-drop landed one slot off.
* `opacity` inside an SVG `style=""` attribute was ignored.
* Dialogs did not close with Escape unless focused.
* Layers drag-and-drop was disabled for top-level rows.

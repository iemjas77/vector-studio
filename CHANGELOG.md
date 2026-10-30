# Changelog

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

# Feature matrix

✅ implemented and covered by automated tests · 🟡 partial (see notes) · ⬜ not started.
Tests: **U** = unit/interaction (Vitest), **E** = Playwright browser, **X** = Electron smoke.

## Phase 1 – working vector editor
| Feature | Status | Tests | Notes |
|---|---|---|---|
| Dark UI: menus, doc tabs, left toolbar, options bar, right panels, status bar | ✅ | E | Panels are collapsible but not draggable/dockable yet |
| Finite, exactly sized artboards, transparent artboards (checkerboard) | ✅ | U, E | |
| Selection tool: click, shift-click, marquee, move, alt-drag copy, scale (corner/edge, shift, alt), rotate (shift = 15°) | ✅ | U, E | Scaling a *rotated* object via the box shears it (KNOWN-ISSUES) |
| Direct selection: anchors, handles, segment reshape, add/delete/convert anchor, marquee | ✅ | U, E | Delete anchor does not re-fit the curve |
| Rectangle, Ellipse (shift = square, alt = from centre) | ✅ | U, E | Corner radius only via SVG import (no UI yet) |
| Pen tool (corner, smooth, close, finish, backspace, shift 45°) | ✅ | U, E | Cannot continue an existing open path yet |
| Editable Bezier nodes | ✅ | U, E | Rect/ellipse convert to path on first node edit |
| Fill / stroke (colour, alpha, width, cap, join, miter, dash) | ✅ | U, E | Solid colours only |
| Transforms incl. numeric X/Y/W/H, nudge | ✅ | U, E | Bounds are world-space of the selection |
| Layers panel: add/delete/rename/reorder, visibility, lock, select, group tree, drag-drop | ✅ | U, E | Drag-drop only for top-level objects |
| Zoom/pan (wheel, ctrl-wheel at cursor, zoom field, fit, hand, space-drag, zoom tool) | ✅ | U, E | |
| Undo/redo (one step per gesture) | ✅ | U, E | |
| Native save/open (`.vstudio`) with validation | ✅ | U, E, X | Round trip proven for geometry, paints, flags, layers, artboards |
| SVG import | 🟡 | U, E | Shapes, paths (all commands incl. arcs), groups, transforms, styles, viewBox. **Not**: text, images, `<use>`, clip/mask, CSS `<style>`, even-odd, true gradients (flat fallback) – each reported to the user |
| SVG export | ✅ | U, E | Layers, groups, transforms, paints preserved; round-trips through our importer |
| PNG export (scale / width, transparent, per artboard) | ✅ | U, E | Verified at 4500×5400 in Chromium; 16384 px/side cap |
| Keyboard shortcuts + shortcuts dialog | ✅ | U, E | |
| Copy/cut/paste/duplicate/group/arrange | ✅ | U | Internal clipboard only |
| Electron shell | 🟡 | X | Linux/Xvfb only; **Windows untested**; no installer |
| Rulers, grid, guides, snapping | ⬜ | | Phase 2 |
| High-DPI / multi-monitor | 🟡 | | DPR-aware canvas + DPR-change listener implemented; only DPR 1 exercised |

## Later phases
| Phase | Item | Status |
|---|---|---|
| 2 | Compound paths, booleans, clipping masks, gradients, align/distribute, guides/snapping, isolation mode, appearance stack, multi-artboard tools | ⬜ (multiple artboards, groups: ✅ basic) |
| 3 | Text (editable, shaping, on-path, paragraph), font discovery, outlines | ⬜ |
| 4 | JPEG, PDF, EPS, ICC/CMYK, bleed/trim, batch + presets | ⬜ (PNG/SVG done) |
| 5 | Image trace, brushes, symbols, patterns, effects, perspective | ⬜ |
| 6 | Batch actions, scripting, plugin API, large-doc optimisation | ⬜ |
| 7 | Regression suite, interoperability, Windows RC | ⬜ |
| – | Print-on-demand: 4500×5400 template preset, transparent PNG | ✅ ; batch resize/export, colour reduction, vector cleanup, export validation, reusable templates ⬜ |

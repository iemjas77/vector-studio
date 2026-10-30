# Next tasks (priority order)

1. **Windows verification** – run the Electron smoke test and the Playwright suite on a Windows 10/11 machine/runner; fix path/DPI/font issues. Package with electron-builder (local only, no publishing).
2. **Compound paths** – model change (`subpaths[]` per path element, even-odd/non-zero fill rule), renderer, hit-test, direct-selection, SVG import/export, schema version 2 + migration from v1. Un-split SVG import.
3. **Boolean operations** – evaluate Paper.js vs a Clipper-based WASM lib against an edge-case corpus (tangent, coincident edges, self-intersection, tiny gaps); implement union/subtract/intersect/exclude with undo.
4. **Rulers, guides, grid, snapping** (snap to guides, artboard edges, anchors) + align/distribute panel.
5. **Gradients** (linear/radial) in model, renderer, SVG import/export, Color panel.
6. **Isolation mode** (double-click group) and **appearance panel** (multiple fills/strokes).
7. Pen tool: continue open path, add/delete anchor under cursor, corner-radius UI for rectangles, curve re-fit on anchor delete.
8. Fix rotated-object scaling (oriented selection box) and add "scale strokes" option.
9. Autosave + crash recovery file; recent files.
10. Panel docking; finer-grained UI subscriptions; virtualised layers list.
11. Phase 3 typography (HarfBuzz) once 2–5 are stable.

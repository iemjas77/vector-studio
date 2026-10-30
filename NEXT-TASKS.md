# Next tasks (priority order)

1. **Windows verification** (`docs/WINDOWS-RELEASE.md`): run all suites, fix path/font/DPI issues, then package locally (no publishing).
2. **Colour management**: LittleCMS (WASM) for ICC conversion, CMYK/spot colours in the model, PDF/X-style output with output intent; measure ΔE against reference swatches before claiming anything.
3. **On-canvas text editing** (caret, selection, IME), per-character styles, justify/paragraph spacing, manual kerning; system-font coverage detection instead of the fallback preference list.
4. **Appearance panel** (multiple fills/strokes/effects), **stroke expansion / offset path**, grid + anchor snapping, units (mm/in/pt).
5. Pen tool: continue open path, add/delete anchor under the cursor, corner-radius control, curve re-fit on anchor delete; direct-select all subpaths of compound paths.
6. Fix rotated-object scaling (oriented selection box) and add a "scale strokes" option.
7. Autosave + crash recovery; recent files; panel docking; virtualised layers list and finer-grained UI subscriptions.
8. Export: EPS, PDF compression + proper transparency groups, crop marks, PNG colour profile, SVG `<text>` option.
9. Creative: symbols, patterns, brushes, live effects, perspective.
10. Plugin sandbox (worker/iframe + message passing) so user scripts can be allowed safely.

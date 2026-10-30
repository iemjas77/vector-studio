# Update 002–003: status against the specification

Legend — **Verified**: implemented and covered by automated tests that pass (Linux only; nothing has run on Windows) · **Unverified**: implemented, not (fully) tested · **In progress** · **Planned** · **Blocked**: needs something this environment lacks · **Unsupported**: deliberately not offered.

## 2. Interface
| Item | Status | Notes |
|---|---|---|
| Menus: File, Edit, Object, Type, Select, Effect, View, Window, Help (+ Plugins) | Verified | Type/Select/Effect/Window added; items map to real commands |
| Left toolbar: grouped tools, flyouts, compact/expanded, tooltips with shortcuts, active indicator | Verified | Not user-rearrangeable yet (Planned) |
| Contextual control bar | In progress | Fill/stroke/stroke width and tool options are live; opacity/position/alignment live in panels, not the bar |
| Multiple document tabs, multiple artboards, rulers, guides, zoom/pan | Verified | |
| Pasteboard (content outside artboards) | Verified | |
| Grids, smart guides (distance labels), canvas rotation, artboard navigation panel | Planned | Snapping to guides/artboards/objects is Verified |
| Dockable/floating/resizable panels, drag-and-drop arrangement | Planned | Panels can be shown/hidden/reordered (arrows) and collapsed; not floating or draggable |
| Persistent workspace layout, presets (Essentials, Essentials Classic, Typography, Illustration, Layout, Print Production, Automation, All Panels), save/rename/duplicate/reset/delete | Verified | "Painting" preset omitted (no painting tools yet) |
| Status bar (zoom, document info, tool, selection, feedback) | Verified | |

### Panels (24 requested)
Verified: Properties, Layers, Appearance (fill/stroke summary, opacity/blend, live effects), Pathfinder, Align, Transform, Color, Gradient (inside Color), Stroke, Transparency (blend + opacity), Artboards, Actions, Document Info, Character/Paragraph (inside the Typography panel: font, weight, size, leading, tracking, alignment, area width).
Planned: Swatches, Glyphs, Brushes, Symbols, Graphic Styles, Links, Navigator, Attributes, Asset Export (export is via File → Export / Batch).

## 3. Tools
| Tool | Status |
|---|---|
| Selection, Direct Selection, Magic Wand (same fill / alt: stroke), Lasso, Pen, Pencil (curve fitting), Type, Rectangle, Rounded Rectangle, Ellipse, Polygon, Star, Line Segment, Arc, Spiral, Eyedropper, Gradient, Artboard, Hand, Zoom | Verified |
| Add/Delete/Convert anchor (Direct Selection: double-click segment, Delete, Alt-click) | Verified (as modes of Direct Selection, not separate tools) |
| Group Selection, Rotate, Reflect, Scale, Shear, Free Transform (numeric via Transform panel: Verified; interactive tools: Planned; selection-box scale/rotate: Verified) |
| Curvature, Smooth, Path Eraser, Join, Knife, Scissors, Shape Builder, Live Paint (x2), Width, Puppet Warp, Paintbrush, Blob Brush, Eraser, Mesh, Blend, Symbol Sprayer, Perspective Grid/Selection, Rectangular/Polar Grid, Area/Vertical Type variants (area type: Verified; vertical: Planned), Character Transformation, Measure | Planned |

## 4. Shortcuts
Verified: Illustrator-style preset (V A P T M L N I G Y Q H Z, Shift+O, Ctrl+G, Ctrl+Shift+G, Ctrl+Z, Ctrl+Shift+Z, Ctrl+C, Ctrl+V, Ctrl+F, Ctrl+B, Ctrl+S, Ctrl+Shift+S) for the tools that exist; B (Paintbrush) and W (Blend) are not bound because those tools do not exist. Customisation, presets, conflict detection, import/export, persistence, and no firing while typing are Verified. Conflicts with browser defaults (Ctrl+F, Ctrl+B) are resolved by the app capturing the keys.

## 5. Editing interactions
Verified: click/shift-click/marquee/lasso/wand selection, anchor and handle editing, double-click isolation (Esc exits), Alt-drag copy, Shift constrain, snapping with guide lines, bounding boxes, numeric transforms, paste in place/in front/in back/on active artboard, bring forward/send backward, lock/hide, select similar (fill/stroke), group/ungroup.
Planned: transform-origin controls, right-click context menus, copy/paste appearance (Eyedropper covers the common case), select by arbitrary attributes, smart-guide labels.

## 6. Advanced vector operations
Verified: Pathfinder (unite/minus/intersect/exclude), compound paths, clipping masks, Expand (Outline Stroke), Offset Path, Transform Each, undoable/non-destructive transforms. Planned: Shape Builder, Opacity Masks, Expand Appearance (needs raster effects), Simplify/Average/Join/Split/Reverse path, Envelope Distort, Object Blending, Live Corners, Variable-width strokes, Repeat.

## 7. Typography
Verified: HarfBuzz shaping (kerning, ligatures, complex scripts), font discovery (system fonts via Electron scan; Linux-verified), tracking, leading, alignment, point + area + path text, in-place editing, create outlines, RTL runs, fallback fonts, missing-font warning (Document Info). Planned: vertical text, OpenType feature UI, alternates/Glyphs panel, variable-font axes, baseline shift, super/subscript, paragraph spacing, tabs, threading, text wrap, character/paragraph styles.

## 8. Appearance and effects
Verified: blend modes (16), opacity, live effects (Gaussian blur, drop shadow, outer glow) editable and saved in native files; exported as SVG filters / PNG / JPEG; PDF keeps blend modes but **cannot hold effects, and the export dialog warns**. Planned: multiple fills/strokes, inner glow, distortion/transform/stylize/raster effects, graphic styles, appearance expansion.

## 9. Colour management
Verified: RGB, hex, alpha, gradients (linear/radial), colour reduction/replace. **Planned / Blocked: CMYK, ICC, spot colours, soft proof, overprint and separation previews** — no colour engine integrated (LittleCMS WASM is the plan). No print-accuracy claim is made anywhere.

## 10. Actions panel
Verified (unit + browser tests): record/pause/resume/stop, semantic steps with parameters, insert steps, create/rename/duplicate/delete actions and sets, reorder, enable/disable, shortcuts (unique, not clashing with built-ins), save/load via persistence across restart, import/export of sets, play/pause/resume/stop/step, progress, error stop with step named, validation, undo of a whole run. Insert-stop (`stop` step) and user prompt (`prompt` step) are Verified. Not recordable (not implemented/verified yet): mouse-based selection, Swatches, Rename layers from the UI (step exists), EPS export.

## 11. Batch processing
Verified: files and folders (Electron folder, browser multi-file/folder), choose recorded action, naming patterns ({file},{name},{n},{date}), sequential processing, progress, cancel, per-file status log, retries, continue/stop on error, originals never modified, unattended rejection of interactive steps, headless CLI with the same engine. Background threads/workers: not used (processing is async on the UI thread, Planned).

## 12. File menu
New (templates/presets), Open, Open Template, Save, Save As (browser downloads / Electron dialog), Import (SVG, Trace Image), Place SVG, Export (PNG, JPEG, PDF, SVG), Batch, Close with unsaved protection: Verified. Planned: Open Recent, Save a Copy as a menu item (the `saveCopy` action step exists), Export for Screens (multi-scale), Asset Export, Package, Document Setup dialog (units, document colour), Print.

## 13–14. Export formats
Verified: SVG, PDF (vector, multi-page, bleed, TrimBox/BleedBox; RGB, outlined text), PNG, JPEG (quality, ppi, flatten). Planned: SVGZ, WebP, TIFF (browser encoder support for WebP is easy; TIFF needs an encoder), DXF, PDF/X, ICC profiles, crop marks, font embedding. **Blocked (no verification tool): EPS** — a PostScript viewer to validate output is not installed. **AI: Unsupported** — no Illustrator is available to validate compatibility; the app never writes a renamed PDF as `.ai`. Use PDF/SVG.

## 15. Import
Verified: SVG (with warnings for everything skipped), Trace Image (PNG/JPEG/GIF/BMP/WebP via the browser decoder). Planned: SVGZ, PDF, EPS, TIFF, DXF, PSD, AI. Warnings for missing fonts: Document Info panel (import-time warnings: Planned).

## 16. Export presets
Verified: print-on-demand T-shirt 4500×5400 PNG (transparent, 300 ppi), web 1×/2×, JPEG, thumbnail, vector PDF/SVG, batch size lists. Planned: user-defined presets (save/edit/duplicate/delete), screen-printing, client logo package, TIFF.

## 17. Print production
Verified: units in px with ppi → inches/cm, bleed, TrimBox/BleedBox, multi-page PDF, export pre-flight (empty artboard, cut-off content, transparency, effects). Planned: mm/pt units, safe margins, crop and registration marks, linked assets, packaging, PDF/X validation (needs an independent validator), separation/overprint preview. No compliance claim is made.

## 18–19. Advanced features, UI quality
Verified: Image Trace, Actions/macros, plugin API (bundled), workspace customisation, templates, shortcuts, keyboard-reachable buttons. Planned: brushes, patterns, symbols, graphic styles, linked assets, perspective, gradient meshes, Live Paint, blending, data-driven graphics, asset libraries, scripting sandbox, tool presets, preferences dialog, light theme, adjustable UI scale, accessibility audit, autosave/crash recovery/backups (important — see NEXT-TASKS).

## 20. Performance
Measured (Linux/Node): 10k objects render ≈ 130–160 ms overview; hit-test ≈ 11 ms; 10k save+load ≈ 80 ms; 20 documents through a 3-step batch action well under 15 s. Not benchmarked: large SVG import, embedded rasters (not supported), text-heavy layouts, extended sessions, undo history memory. No workers/GPU used.

## 21. Testing
275 unit/interaction tests, 49 browser tests (real Chromium), PDF tests against poppler, Chromium-vs-ours SVG comparison (shapes, gradients, clips, text, blend modes, filters), Electron and CLI smoke tests. **All run on Linux; none on Windows.**

# Feature matrix

✅ implemented and covered by automated tests · 🟡 partial (see notes) · ⬜ not started.
Tests: **U** unit/interaction (Vitest) · **E** Playwright browser · **X** Electron smoke · **C** CLI smoke · **P** PDF checked with poppler.

## Phase 1 – working vector editor (complete)
| Feature | Status | Tests | Notes |
|---|---|---|---|
| Dark UI: menus, doc tabs, toolbar, options bar, right panels, status bar | ✅ | E | Panels collapsible, not dockable |
| Finite artboards, transparent artboards, multiple artboards | ✅ | U, E | |
| Selection tool (move, scale, rotate, alt-copy), Direct Selection (anchors, handles, segments) | ✅ | U, E | See KNOWN-ISSUES for rotated scaling |
| Rectangle, Ellipse, Pen, Hand, Zoom | ✅ | U, E | |
| Fill/stroke (colour, alpha, width, cap, join, miter, dash) | ✅ | U, E | |
| Numeric transforms, nudge, copy/paste/duplicate/group/arrange | ✅ | U, E | |
| Layers panel (tree, rename, visibility, lock, drag-drop) | ✅ | U, E | |
| Zoom/pan, undo/redo, native save/open, SVG import/export, PNG export, shortcuts | ✅ | U, E, X | |

## Phase 2 – advanced vector (mostly complete)
| Feature | Status | Tests | Notes |
|---|---|---|---|
| Compound paths (make/release, even-odd/non-zero, SVG round trip) | ✅ | U, E | Direct selection edits the primary subpath only |
| Boolean ops (unite, minus front, intersect, exclude) | ✅ | U, E | Edge-case corpus; strokes ignored |
| Clipping masks (make/release, render, hit-test, SVG clipPath round trip) | ✅ | U, E, P | |
| Gradients (linear, radial; stops, alpha, angle; SVG + PDF) | ✅ | U, E, P | No stroke gradients, no gradientTransform |
| Align / distribute (to selection or artboard) | ✅ | U, E | |
| Rulers, guides (drag from ruler, move, delete), snapping to guides/artboards/objects | ✅ | U, E | No grid, no anchor snapping, px units only |
| Isolation mode | ✅ | U | Group-level only |
| Multiple artboards (add, size, presets, per-artboard export) | ✅ | U, E | |
| Expand Stroke (caps, joins, miter limit, dashes) and Offset Path (grow/shrink) | ✅ | U, E | Outlines are polygonal approximations of curves (0.05 unit flatness) |
| Appearance panel (multiple fills/strokes) | ⬜ | | |
| Geometric edge-case regression tests | ✅ | U | Beziers, booleans, hit-testing, compound paths |

## Phase 3 – typography (core complete, editing UX basic)
| Feature | Status | Tests | Notes |
|---|---|---|---|
| Editable text objects (point + area), kept editable in `.vstudio` | ✅ | U, E | One style per text object |
| Font selection (bundled Inter, system fonts in Electron), weight, italic | ✅ | U, E, X | System fonts verified on Linux only |
| Shaping: kerning, ligatures, complex scripts (HarfBuzz) | ✅ | U | |
| Layout: wrap, alignment, line height, tracking | ✅ | U | No justify, no paragraph spacing |
| Multilingual + fallback fonts | 🟡 | U | Latin/Greek/Cyrillic; Arabic/Hebrew (RTL, simplified bidi); CJK via fallback. Verified with the fonts available in the test machine |
| Text on path | ✅ | U, E | Single line |
| Outline conversion | ✅ | U, E, X | |
| On-canvas text editing / caret / per-character styles / manual kerning | ⬜ | | Text is edited in the Typography panel |

## Phase 4 – professional export (partial)
| Feature | Status | Tests | Notes |
|---|---|---|---|
| PNG (scale/width, transparent, ppi metadata) | ✅ | U, E | |
| JPEG (quality, ppi) | ✅ | U, E | |
| SVG | ✅ | U, E | Chromium renders it the same as our renderer (interop test) |
| PDF (vector, multi-page, bleed/TrimBox) | ✅ | U, P, E | RGB only, no font embedding (outlines), uncompressed |
| Per-artboard and all-artboards export, presets, batch sizes | ✅ | U, E, C | |
| Print dimensions (ppi → inches/cm), bleed | ✅ | U, E | No crop marks |
| Export pre-flight checks | ✅ | U, E | |
| EPS, ICC/CMYK, spot colours, `.ai` | ⬜ | | Not started. **No print-accuracy claim is made.** |

## Phase 5 – creative tools (minimal)
| Feature | Status | Tests | Notes |
|---|---|---|---|
| Image tracing (colour quantise → editable paths) | ✅ | U, E | ImageTracer; images downscaled to 1600 px |
| Brushes, symbols, patterns, live effects, perspective | ⬜ | | |

## Phase 6 – automation
| Feature | Status | Tests | Notes |
|---|---|---|---|
| Action lists (JSON), batch runner, headless CLI | ✅ | U, C | |
| Plugin API (bundled plugins) | ✅ | U, E | No third-party script loading (ADR-012) |
| Large-document performance | 🟡 | U | 10k objects budgets; no virtualised panels yet |

## Print-on-demand
| Feature | Status |
|---|---|
| 4500×5400 transparent template with guides, 300 ppi | ✅ |
| Transparent PNG export (verified at 4500×5400 in Chromium) | ✅ |
| Batch resize & export | ✅ |
| Colour reduction, vector cleanup | ✅ |
| Export validation (pre-flight) | ✅ |
| Reusable templates (built-in + "New from Template File") | ✅ |

## Phase 7 – stability
Regression suites, SVG interop (Chromium), PDF interop (poppler) exist. **Windows release candidate: not done** (`docs/WINDOWS-RELEASE.md`).

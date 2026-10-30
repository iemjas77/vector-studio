# Architecture decision records

## ADR-001: Electron + React + TypeScript, DOM-free core
*Accepted.* Windows is the first target; a web stack gives fast iteration, headless testing in the cloud (Chromium + Node), and a path to Windows via Electron. The document engine, geometry and editor controller have no DOM dependency so they test in Node and can later be reused by batch/CLI automation.
*Consequence:* larger install than a native app; Chromium security updates must be tracked.

## ADR-002: Canvas2D as the single renderer for now
*Accepted (revisit at Phase 4/5).* Needed: AA, clipping, alpha, dash, group opacity. Canvas2D provides all of that, runs identically in the browser, Electron and Node (`@napi-rs/canvas`), and is pixel-testable. Measured: 10k mixed objects ≈ 130–160 ms overview, ≈ 8 ms zoomed in with culling. CanvasKit would add a second code path and ~7 MB WASM without a demonstrated need yet.
*Revisit when:* blend modes, live blur/effects, large-doc frame rate or CMYK soft-proofing demand it.

## ADR-003: Immutable documents with snapshot history
*Accepted.* immer gives structural sharing, so each undo step is a pointer; no hand-written inverse commands to get wrong. Property-style test: 200 random edits then full undo returns the *identical* initial object. Gestures use a transaction with `restoreBase` so drags are computed from the start state (no drift) and are one undo step.

## ADR-004: Handles relative to anchors; live rect/ellipse
*Accepted.* Relative handles make node moves trivially correct and keep serialization compact. Rect/ellipse stay parametric until a node edit converts them (same id/appearance), like Illustrator "live shapes".

## ADR-005: Strokes are not scaled separately from transforms
*Accepted for Phase 1, known limitation.* Scale handles apply an affine transform to the element, so stroke width scales with it (as in SVG). A later "scale strokes" option will bake scale into geometry.

## ADR-006: One command registry
*Accepted.* Menus, shortcuts and the help dialog are generated from `commands.ts`, which prevents dead menu items and duplicate/contradictory shortcuts.

## ADR-007: Native file format = versioned JSON validated with zod
*Accepted.* Human-readable, diffable, easy to migrate (`version`), strict on load. Future large assets (images, fonts) will move to a zip container; the JSON document stays the manifest.

## ADR-008: Compound paths as primary subpath + `extra` subpaths
*Accepted; implemented in format v2.* A path element keeps `nodes/closed` (so all single-path code is unchanged) and adds `extra[]` subpaths and a `fillRule`. Cost: direct-selection edits only the primary subpath. SVG import keeps multi-subpath paths intact; v1 files migrate on load.

## ADR-009: Text = HarfBuzz layout drawn as outlines
*Accepted.* One shaping engine (HarfBuzz WASM) produces glyph outlines, so canvas, SVG, PDF, booleans and "Create Outlines" agree exactly, kerning/ligatures/complex scripts are correct, and exports have no font dependency. Cost: no native text in SVG/PDF (outlines only), text cannot be edited in other programs after export, simplified bidi, and CPU cost for large text blocks (mitigated by per-element layout cache).

## ADR-010: Paper.js for boolean operations
*Accepted.* Preserves Beziers, robust on tangent/coincident cases in our corpus (`tests/unit/boolean.test.ts`: overlapping, shared edges, identical shapes, holes, curves, rotated, groups). Runs headless via `paper-core`. Booleans use fill geometry only (strokes are ignored).

## ADR-011: Own PDF writer, verified with poppler
*Accepted.* Output is small in scope (paths, gradients, clipping, boxes) and can be checked pixel-wise by rasterising with `pdftoppm`. Limitations are listed in KNOWN-ISSUES (RGB only, uncompressed, simplified transparency).

## ADR-012: No runtime loading of third-party scripts
*Accepted for now.* Plugins are bundled modules using a narrow API. Evaluating arbitrary JS would need `unsafe-eval` in the CSP and a real sandbox (iframe/worker with message-passing); that design is future work.

## ADR-013: Electron serves the UI from `app://vs/`
*Accepted.* `file://` blocks `fetch()` of the HarfBuzz `.wasm`. A privileged custom protocol with a path-traversal guard fixes that; CSP allows `'wasm-unsafe-eval'` only.

## ADR-014: Gradients in bounding-box units
*Accepted.* Gradients follow the object when it is resized and map directly to SVG `objectBoundingBox` and PDF shadings. SVG import converts `userSpaceOnUse` gradients using the element's bounds; `gradientTransform` is not supported.

# Vector Studio

Offline-first, free-to-run professional vector graphics editor (desktop, Electron). Target: Windows 10/11.
**Status: v0.2 – verified on Linux only; Windows is untested.** See PROJECT-STATUS.md for what has been verified, KNOWN-ISSUES.md for limitations.

## What works today
* Drawing and editing: artboards (incl. a 4500×5400 transparent print-on-demand template), Selection / Direct Selection / Rectangle / Ellipse / Pen / Type / Hand / Zoom tools, editable Bezier anchors, fills, strokes, gradients, layers, groups, isolation mode, compound paths, boolean operations, clipping masks, align/distribute, rulers, guides, snapping, undo/redo.
* Text: HarfBuzz shaping (kerning, ligatures, complex scripts), system fonts, area/point/on-path text, create outlines.
* Files: native `.vstudio`, SVG import/export, PNG/JPEG/PDF export with ppi and bleed, presets, batch resize & export, image tracing.
* Print-on-demand helpers: templates, vector clean-up, colour reduction, export pre-flight checks.
* Automation: JSON action lists, headless CLI, plugin API (docs/AUTOMATION.md).

**Not available:** CMYK/ICC colour management (RGB only), EPS, `.ai`, brushes/symbols/patterns/effects, on-canvas text editing. Do not rely on it for print colour accuracy.

## Run
```bash
npm install
npm run dev          # browser dev server
npm start            # build + Electron window (needs a display; on Linux CI use xvfb-run)
npm test             # unit/interaction/renderer/PDF tests
npm run test:e2e     # real-browser end-to-end tests
npm run test:cli     # headless batch exporter smoke test
npm run typecheck && npm run lint
```

## Docs
ARCHITECTURE · TECH-STACK · DECISIONS · FEATURE-MATRIX · ROADMAP · RISK-REGISTER · TESTING-STRATEGY · PROJECT-STATUS · KNOWN-ISSUES · NEXT-TASKS · HANDOVER · CHANGELOG · docs/AUTOMATION.md · docs/WINDOWS-RELEASE.md

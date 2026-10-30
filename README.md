# Vector Studio

Offline-first, free-to-run professional vector graphics editor (desktop, Electron). Target: Windows 10/11. **Status: v0.1 – Phase 1 editor working; verified on Linux only, Windows untested.** See PROJECT-STATUS.md.

## What works today
Artboards (incl. a 4500×5400 transparent print-on-demand preset), Selection / Direct Selection / Rectangle / Ellipse / Pen / Hand / Zoom tools, editable Bezier anchors and handles, fill & stroke, layers, groups, undo/redo, save/open (`.vstudio`), SVG import/export, PNG export, keyboard shortcuts. Limitations: KNOWN-ISSUES.md.

## Run
```bash
npm install
npm run dev          # browser dev server
npm start            # build + Electron window (needs a display; on Linux CI use xvfb-run)
npm test             # unit/interaction/renderer tests
npm run test:e2e     # real-browser end-to-end tests
npm run typecheck && npm run lint
```

## Docs
ARCHITECTURE · TECH-STACK · DECISIONS · FEATURE-MATRIX · ROADMAP · RISK-REGISTER · TESTING-STRATEGY · PROJECT-STATUS · KNOWN-ISSUES · NEXT-TASKS · HANDOVER · CHANGELOG

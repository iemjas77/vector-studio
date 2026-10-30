# Handover – milestone "Phase 0 + Phase 1"

## Completed features
See FEATURE-MATRIX.md (all Phase 1 rows ✅ except SVG import 🟡 and Electron 🟡). Docs for Phase 0 are in the repo root.

## Verified tests
`npm run typecheck && npm run lint && npm test && npm run test:e2e` all green; `xvfb-run -a npm run test:electron` OK. Details and counts: PROJECT-STATUS.md. Nothing has been run on Windows.

## How to resume
```bash
npm install
npm test            # Node unit/interaction/renderer tests
npm run test:e2e    # builds, serves, drives real Chromium (uses /opt/pw-browsers/chromium if present)
npm run dev         # Vite dev server (browser)
npm start           # build + launch Electron (needs a display)
```
Test hook: the running app exposes `window.__vs.workspace` (read-only use by e2e tests).

## Architecture changes to know
* Core is DOM-free and lint-enforced (`src/core/**` may not import React/UI/render/editor).
* `History.restoreBase()` exists for absolute-from-start drags; tools call `begin → restoreBase/update* → commit`.
* All user actions go through `src/ui/commands.ts` (menus + shortcuts) → `Editor` methods → `ops.ts` commands.
* `moveElement`'s `index` is a pre-move index (it compensates for removal).

## Known bugs / unfinished
KNOWN-ISSUES.md is authoritative. Biggest: no compound paths, no Windows verification, rotated-object scaling shears, no autosave.

## Gotchas discovered
* Playwright `filechooser` + `setFiles` fails silently if the test title (hence output path) contains non-ASCII characters (an arrow in a title caused a spurious "cancel"). Keep e2e test titles ASCII.
* ESLint 10 flat config; `react-hooks` plugin is not installed (do not add `eslint-disable react-hooks/*` comments).
* The page CSP forbids inline scripts; keep it that way for Electron.

## Next priorities
NEXT-TASKS.md (1: Windows verification, 2: compound paths, 3: booleans).

# Project status

**Version 0.3.0 (Update 002–003 in progress; see docs/SPEC-002-003-STATUS.md)** · previously 0.2.0 – not released, not packaged, never run on Windows.**
Phases 0 and 1 are complete. Phases 2–6 are partly implemented (see ROADMAP.md / FEATURE-MATRIX.md for exactly what is and is not done); Phase 7 (Windows RC) has not been started.

## Verified (last full run, Linux container)
| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` (Vitest, Node) | **275 passed** in 21 files |
| `npm run test:e2e` (Playwright, real Chromium) | **49 tests** (one file-chooser test is occasionally flaky under load; see KNOWN-ISSUES) |
| `xvfb-run -a npm run test:electron` | OK (shape, HarfBuzz text over `app://`, 109 system fonts discovered, native save) |
| `npm run test:cli` | OK |
| Windows | **not tested** |

## Measured (Linux, Node; relative numbers only)
* Render 10 000 mixed objects at 1920×1080: ≈ 130–160 ms overview, ≈ 8 ms zoomed in (culling). Hit-test among 10 000 objects ≈ 11 ms. Save + load of 10 000 objects ≈ 80 ms.
* 4500×5400 transparent PNG export verified in real Chromium (exact size, alpha, 300 ppi metadata).
* PDF output matches the canvas renderer within anti-aliasing (≤ 1–2 % clearly different pixels, edges only) when rasterised by poppler; SVG output matches Chromium's SVG renderer (< 1 % different pixels).
* Boolean results match analytic areas within 1 % for curved cases (circle − rectangle, donut) and within about 3 % for rectangles (tolerances of the pixel-counting tests).

## Code size
≈ 8 100 lines in `src/`, `cli/`, `electron/`; ≈ 3 400 lines of tests.

## Where to look
README.md · ARCHITECTURE.md · DECISIONS.md · FEATURE-MATRIX.md · ROADMAP.md · KNOWN-ISSUES.md · NEXT-TASKS.md · HANDOVER.md · docs/AUTOMATION.md · docs/WINDOWS-RELEASE.md

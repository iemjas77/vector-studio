# Project status

**Milestone reached:** Phase 0 (research/architecture) + Phase 1 (working vector editor). Version 0.1.0 – not released, not packaged.

## Verified (last full run)
| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` (Vitest, Node) | **112 passed** in 6 files |
| `npm run test:e2e` (Playwright, real Chromium) | **23 passed** |
| `xvfb-run -a npm run test:electron` | OK (Linux only) |
| Windows | **not tested** |

## Measured
* Render 10 000 mixed objects, 1920×1080: ≈ 130–160 ms overview, ≈ 8 ms zoomed in (culling).
* Hit-test among 10 000 objects ≈ 11 ms; 20 000-element edit + undo + save/parse well under budget.
* Serialise + parse 10 000 objects ≈ 80 ms.
* Circle approximation by 4 Beziers: max radial error 0.03 %.
* PNG export is pixel exact in size (tested 120×80 … 4500×5400) and alpha; shape edges land within one pointer-mapping pixel.
(Numbers are from this Linux cloud container; treat as relative, not as Windows performance.)

## Code size
≈ 4 800 lines in `src/`, ≈ 1 700 lines of tests.

## Where to look
README.md (run it) · ARCHITECTURE.md · DECISIONS.md · FEATURE-MATRIX.md · KNOWN-ISSUES.md · NEXT-TASKS.md · HANDOVER.md

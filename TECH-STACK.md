# Tech stack

| Area | Choice | Version | License | Status |
|---|---|---|---|---|
| Shell | Electron | 45.1.0 | MIT (bundles Chromium; ship `LICENSES.chromium.html`) | Used; launches and passes a smoke test on **Linux/Xvfb**. Windows not tested. |
| UI | React | 19.3 | MIT | Used |
| Language/build | TypeScript 6, Vite 8 | | Apache-2.0 / MIT | Used |
| Styling | Tailwind CSS 4 (+ small hand-written CSS) | 4.3 | MIT | Used |
| UI state | zustand | 5.0 | MIT | Used for dialogs/toasts/panel state only |
| Document updates | immer | 11.2 | MIT | Used (core) |
| File validation | zod | 4.6 | MIT | Used (core) |
| XML | fast-xml-parser | 5.11 | MIT | Used for SVG import |
| Rendering | Canvas2D (browser / `@napi-rs/canvas` 1.1 in tests) | | MIT | Used – see ADR-002 |
| Unit tests | Vitest 5 | | MIT | Used |
| E2E tests | Playwright 1.64 (system Chromium) | | Apache-2.0 | Used |
| Lint | ESLint 10 + typescript-eslint | | MIT | Used |
| PNG decode in tests | pngjs | 7.0 | MIT | Dev only |

## Evaluated but deferred (not installed)
* **Paper.js** – booleans/offsetting for Phase 2. To be benchmarked against `clipper2-wasm`/hand-written code with a regression corpus before adopting.
* **CanvasKit/Skia** – only if Canvas2D misses performance/fidelity needs (blend modes, large blur effects, CMYK pipelines). Avoid two renderers without proof.
* **HarfBuzz (harfbuzzjs)** – Phase 3 shaping.
* **LittleCMS (WASM build)** – Phase 4 ICC conversion.
* **Rust** – none needed so far (10k-object render ≈ 130–160 ms, hit-test ≈ 11 ms, 10k save/load ≈ 80 ms in Node). Revisit for booleans/tracing if profiling shows need.

All direct dependencies are MIT or Apache-2.0 (checked from each package's `package.json`).

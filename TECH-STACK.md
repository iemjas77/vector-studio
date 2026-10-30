# Tech stack

| Area | Choice | Version | License | Status |
|---|---|---|---|---|
| Shell | Electron | 45.1.0 | MIT (bundles Chromium; ship `LICENSES.chromium.html`) | Used; launches and passes a smoke test on **Linux/Xvfb**. Windows not tested. |
| UI | React | 19.3 | MIT | Used |
| Language/build | TypeScript 6, Vite 8 | | Apache-2.0 / MIT | Used |
| Styling | Tailwind CSS 4 (+ small hand-written CSS) | 4.3 | MIT | Used |
| UI state | zustand | 5.0 | MIT | Dialogs/toasts/panel state only |
| Document updates | immer | 11.2 | MIT | Used (core) |
| File validation | zod | 4.6 | MIT | Used (core, actions) |
| XML | fast-xml-parser | 5.11 | MIT | SVG import |
| Booleans | **Paper.js** (`paper-core`) | 0.12 | MIT | Used for unite/minus/intersect/exclude (headless, no canvas needed) |
| Text shaping + outlines | **harfbuzzjs** (HarfBuzz WASM) | 1.6.4 | MIT | Used for all text layout and glyph outlines |
| Image tracing | imagetracerjs | 1.2.6 | Unlicense | Used (colour quantise + curve fit) |
| Default font | Inter Regular/Bold | 3.x/4.x | SIL OFL 1.1 | Bundled (`src/assets/fonts`, licence text alongside) |
| Rendering | Canvas2D (browser / `@napi-rs/canvas` 1.1 in tests & CLI) | | MIT | Used – ADR-002 |
| Unit tests | Vitest 5 | | MIT | Used |
| E2E tests | Playwright 1.64 (system Chromium) | | Apache-2.0 | Used |
| Lint | ESLint 10 + typescript-eslint | | MIT | Used |
| PNG decode in tests | pngjs | 7.0 | MIT | Dev only |
| PDF verification (tests only) | poppler-utils (`pdftoppm`, `pdfinfo`) | system | GPL (not shipped) | Tests are skipped when absent |

## Evaluated but not adopted
* **CanvasKit/Skia** – not needed so far (ADR-002).
* **LittleCMS (WASM)** – needed for ICC/CMYK; not started.
* **Rust** – nothing has needed it: 10k-object render ≈ 130–160 ms, hit-test ≈ 11 ms, save/load of 10k objects ≈ 80 ms (Linux, Node).
* **opentype.js** – replaced by HarfBuzz (shaping + outlines in one library).
* **PDFKit / jsPDF** – replaced by a small purpose-built PDF writer that we can verify against poppler.

All direct dependencies are MIT, Apache-2.0 or Unlicense (read from each package's `package.json`). Inter is OFL 1.1.

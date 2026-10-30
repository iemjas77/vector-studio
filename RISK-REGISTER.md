# Risk register

| # | Risk | Likelihood | Impact | Mitigation / status |
|---|---|---|---|---|
| 1 | Windows-specific bugs (paths, fonts, DPI, installer) undetected because development is on Linux | High | High | Open. Everything is Linux-only; `docs/WINDOWS-RELEASE.md` lists what to verify. Host access is behind `platform/` and `electron/`. |
| 2 | Boolean/geometry robustness | Med | High | Mitigated for the tested corpus (Paper.js + 10 edge-case tests); more cases (self-intersecting, extreme coordinates, stroked operands) not covered. |
| 3 | Text shaping/fallback/bidi correctness | Med | High | HarfBuzz handles shaping; bidi is simplified, fallback chosen from a guessed list. Needs native-speaker review for Arabic/Hebrew/Indic/CJK. |
| 4 | Colour accuracy (CMYK/ICC) claims | Med | High | No colour management exists; docs state "RGB only, no print-accuracy claim". |
| 5 | Illustrator `.ai` import | High | Med | Not attempted. |
| 6 | Canvas2D limits (blend modes, huge canvases, memory) | Med | Med | 16384 px/side cap; 4500×5400(+bleed) exports verified in Chromium; blend modes absent. |
| 7 | Large-document UI performance | Med | Med | Render culling + caches ok at 10k objects; panels re-render per pointer move; layout cache keyed on element identity. |
| 8 | Data loss on crash | Med | High | No autosave; unsaved-change prompts only. |
| 9 | Format evolution | Med | Med | Versioned schema with migration (v1→v2 tested); no downgrade. |
| 10 | Dependency/security drift (Electron, WASM) | Med | Med | Sandboxed renderer, contextIsolation, CSP (`wasm-unsafe-eval` only), path-traversal guard on `app://` and on font reads, navigation blocked. Needs update cadence. |
| 11 | Untrusted input (SVG, `.vstudio`, images, fonts) | Med | Med | Strict zod validation, size limits (trace 16 MP, export 16384 px, binary open 100 MB). Font files are parsed by HarfBuzz WASM (memory-safe sandbox), not natively. |
| 12 | Third-party code execution through plugins | Low | High | Not supported (ADR-012). |
| 13 | Bundle size / startup (Inter inlined ≈ 1.6 MB, HarfBuzz WASM 0.4 MB, Paper) | Low | Low | Fonts are code-split and loaded at boot; acceptable for desktop. |

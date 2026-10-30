# Roadmap

Status as of this milestone: **Phase 0 complete, Phase 1 complete** (with the limitations in KNOWN-ISSUES.md). Nothing after Phase 1 is started.

| Phase | Goal | Exit criteria |
|---|---|---|
| 0 ✅ | Architecture, stack validated by prototype | Docs in repo; core/render/editor/UI built and tested |
| 1 ✅ | Working vector editor | Every Phase-1 item in FEATURE-MATRIX is ✅ with tests; save→reopen lossless |
| 2 | Advanced vector | Compound paths (first), booleans via vetted lib + edge-case corpus, clipping masks, gradients, align/distribute, guides/snapping/rulers, isolation mode, appearance panel, multi-artboard tools |
| 3 | Typography | HarfBuzz shaping, font discovery, editable text kept in native file, on-path text, outline conversion, multilingual/fallback tests |
| 4 | Professional export | JPEG, PDF (+EPS if practical), per-artboard & batch export, presets, bleed/trim, ICC where supported; measured colour checks |
| 5 | Creative tools | Trace, brushes, symbols, patterns, non-destructive effects |
| 6 | Automation | Action/batch runner on the DOM-free command layer, scripting, plugin API, large-doc optimisation |
| 7 | Stability | Regression suite, interop corpus, **Windows** release candidate (not published without owner approval) |

Ordering rationale: compound paths and booleans unblock real logo work and SVG fidelity; text is the largest risk so it follows once the geometry core is robust; export formats depend on text and gradients being final.

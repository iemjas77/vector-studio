# Roadmap

| Phase | Goal | Status |
|---|---|---|
| 0 | Architecture, stack validated by prototype | ✅ done |
| 1 | Working vector editor | ✅ done |
| 2 | Advanced vector | 🟡 compound paths, booleans, clipping masks, gradients, align/distribute, guides/snapping/rulers, isolation, multi-artboard done. stroke expansion and offset path done. **Missing:** appearance panel, grid, anchor snapping |
| 3 | Typography | 🟡 engine complete (HarfBuzz); editing UX is panel-based. **Missing:** on-canvas editing, per-character styles, manual kerning, justify, paragraph spacing |
| 4 | Professional export | 🟡 PNG/JPEG/SVG/PDF, bleed, ppi, presets, batch. **Missing:** EPS, ICC/CMYK, spot colours, crop marks, PDF text embedding |
| 5 | Creative tools | 🟡 image tracing only. **Missing:** brushes, symbols, patterns, live effects, perspective |
| 6 | Automation | 🟡 actions, batch CLI, plugin API done. **Missing:** sandboxed third-party scripting, large-document optimisation (virtualised panels, finer subscriptions) |
| 7 | Stability | 🟡 test suites + interop checks exist. **Missing:** Windows verification and release candidate (not publishable without owner approval) |

Ordering rationale for what is left: Windows verification first (every claim is currently Linux-only), then colour management (print accuracy), then on-canvas text editing, then the remaining Phase 2/5 features.

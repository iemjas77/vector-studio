# Risk register

| # | Risk | Likelihood | Impact | Mitigation / status |
|---|---|---|---|---|
| 1 | Windows-specific bugs (paths, fonts, DPI, installer) undetected because development is on Linux | High | High | Electron smoke only on Linux. **Need a Windows CI runner or tester before any release.** Keep file access behind `platform/`. |
| 2 | Boolean ops / stroke expansion correctness (robustness of floating-point geometry) | High | High | Not started. Plan: adopt a proven library, build an edge-case corpus (tangent, coincident, self-intersecting) before shipping. |
| 3 | Text shaping, fallback fonts, RTL/complex scripts | High | High | Phase 3. Use HarfBuzz; do not hand-roll shaping. |
| 4 | Color accuracy (CMYK/ICC) claims | Med | High | Phase 4. Never claim print accuracy without measured ΔE checks and a real ICC engine (LittleCMS). |
| 5 | Illustrator `.ai`/PDF-compat import | High | Med | Research-dependent, not promised. PDF-based `.ai` may be partially importable. |
| 6 | Canvas2D limits (blend modes, huge canvases) | Med | Med | 16384 px export cap enforced; ADR-002 revisit triggers. Browser canvas memory limits for 4500×5400 (97 MB RGBA) tested only in Node/Chromium-headless. |
| 7 | Large-document performance (UI re-renders panels on each pointer event) | Med | Med | Layers panel capped at 300 rows/layer; render culling works; needs virtualisation and finer-grained subscriptions. |
| 8 | Data loss on crash | Med | High | No autosave/recovery yet; unsaved-change prompts exist. Add autosave to a recovery file. |
| 9 | Format evolution | Med | Med | Versioned schema + strict validation; migrations not yet needed. |
| 10 | Dependency/security drift (Electron/Chromium) | Med | Med | Sandboxed renderer, contextIsolation, no nodeIntegration, CSP, navigation blocked. Needs update cadence. |
| 11 | Single-subpath path model blocks icons with holes | High | Med | ADR-008; Phase 2 first task. |

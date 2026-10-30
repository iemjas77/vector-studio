# Known issues and limitations (honest list)

## Platform / verification
* **Windows 10/11 has not been tested at all.** Everything ran on Linux (Chromium, Node, Electron under Xvfb). No installer, no signing (`docs/WINDOWS-RELEASE.md`).
* System-font discovery was verified on Linux only. On Windows, `.ttc` collections expose only their first face.
* High-DPI / multi-monitor code exists (DPR-aware canvas and DPR-change listener) but was only exercised at devicePixelRatio 1.
* No full-UI screenshot regression tests.
* PDF checks need `poppler-utils`; those tests are skipped when it is absent.

## Editing
* Scaling a **rotated** object with the selection box shears it; the box is axis-aligned.
* Stroke width scales with object transforms (no "scale strokes" toggle).
* Direct selection edits only the primary subpath of a compound path.
* Pen tool cannot continue an existing open path or add anchors by clicking; double-click a segment with Direct Selection instead.
* Deleting an anchor keeps neighbours' handles (no curve re-fit).
* Alt-drag duplication needs Alt held when the drag starts.
* Rectangle corner radius has no UI control.
* Clipboard is internal to the app.
* No appearance stack (one fill + one stroke), no stroke expansion/offset path, no blend modes, no grid, no anchor/path snapping, rulers are px only.
* Boolean operations use fill geometry only; strokes are ignored. Result takes one operand's look.
* Isolation mode is for groups only and only signalled in the status bar and dimming.
* Layers panel: only top-level objects can be drag-reordered; capped at 300 rows per layer; not virtualised. The whole UI re-renders on each pointer event (fine at current sizes).

## Colour and gradients
* RGB only. No CMYK, ICC, spot colours or colour-managed export; PNG/JPEG carry no colour profile. **Do not rely on this app for print colour accuracy.**
* Gradients: no stroke gradients, no `gradientTransform`, radial focal points ignored; PDF ignores gradient stop transparency.

## Text
* One style per text object. No per-character styling, manual kerning, justify, paragraph spacing/indent, vertical text, OpenType-feature UI, variable-font axes or spell check.
* Text is edited in the Typography panel, not on the canvas.
* Simplified bidi (directional runs only; brackets are not mirrored). Colour/emoji fonts render as plain outlines.
* Missing glyphs show as the font's "notdef" until fallback fonts finish loading (first use only); fallback families are guessed from a preference list.
* Weight uses the nearest installed face (no synthetic bold); italic is synthesised (12° skew) when the family has no italic face.
* Text on a path: single line, no baseline offset, spacing is not corrected at sharp corners.
* SVG/PDF export text as outlines (live text is not exported). SVG **import** does not read `<text>`.

## File I/O
* SVG import ignores: text, images, `<use>`, `<mask>`, CSS `<style>`, `gradientTransform`; each is reported in the import notes.
* PDF: uncompressed, RGB, text as outlines, group opacity not composited as a unit, no crop marks.
* No EPS, no `.ai`, no autosave/crash recovery.
* `.vstudio` v1 files are migrated on load; there is no downgrade path.

## Creative / automation
* Image trace quality is that of ImageTracer (no centre-line mode); images are downscaled to 1600 px before tracing.
* No brushes, symbols, patterns, live effects or perspective tools.
* Plugins must be bundled; third-party scripts cannot be loaded (ADR-012).
* The CLI needs the dev dependency `@napi-rs/canvas` and has only been run on Linux.

## UI
* Panels are fixed on the right (collapsible only), keyboard accessibility is partial, tool shortcuts assume English letters.

# Known issues and limitations (honest list)

## Platform / verification
* **Windows 10/11 has not been tested at all.** Development and every test ran on Linux (Chromium, Node, Electron under Xvfb). No installer, no code signing.
* High-DPI and multi-monitor handling is implemented but only exercised at devicePixelRatio 1.
* No full-UI screenshot regression tests yet (see TESTING-STRATEGY).

## Editing
* Path model is single-subpath: no compound paths (holes). Imported multi-subpath SVG paths are split into a group with a warning; holes become filled shapes.
* Scaling via the selection box on a **rotated** object applies a world-axis scale after rotation, which shears it. Rotated single objects show an axis-aligned box.
* Stroke width scales with object transforms (no "scale strokes" toggle).
* Pen tool cannot continue an existing open path or add anchors on click; use direct-selection double-click on a segment to add an anchor.
* Deleting an anchor keeps neighbours' handles (no curve re-fit).
* Alt-drag duplication must have Alt held when the drag starts.
* Rectangle corner radius has no UI control (only preserved from SVG/native files).
* Clipboard is internal to the app (no system clipboard / cross-app paste).
* Rotate cursor feedback is not shown in the rotation zone.
* Pasted offset is fixed at 10 units.
* No fill-rule control (non-zero only), no gradients/patterns, no blend modes.
* Direct-selection snapping/guides/rulers/grid do not exist yet.
* Layers panel: only top-level objects can be drag-reordered; capped at 300 rows per layer; not virtualised.
* Whole UI re-renders on each pointer event (fine for current sizes; will need finer subscriptions for huge documents).

## File I/O
* SVG import ignores: text, images, `<use>`, clipPath/mask, CSS `<style>`, even-odd fill rule; gradients become the first stop colour. Each is reported in the import notes.
* SVG export writes ellipses as `<ellipse>` (exact) while the editor renders them as 4 Bezier segments (max 0.03 % radius difference).
* Only `.vstudio` (native), SVG and PNG exist. No JPEG/PDF/EPS/AI.
* No autosave/crash recovery.
* `ppi` is stored but not used for print dimensions yet.

## UI
* Panels are fixed on the right (collapsible only) – not dockable/floating.
* Keyboard accessibility is partial (buttons are focusable; canvas tools are pointer-only).
* Tool shortcuts use English letters; no keyboard-layout remapping UI.

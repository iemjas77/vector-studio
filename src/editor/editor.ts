import {
  History, addElement, addArtboard, addLayer, convertToPath, createDocument, defaultStroke, duplicateElements, elementBounds, elementNodes,
  elementsInRect, getElement, groupElements, hitTest, insertCopies, locate, moveLayer, parentMatrix, patchArtboard, patchElements, patchLayer,
  removeArtboard, removeElements, removeLayer, reorder, selectionBounds, setPathNodes, solid, transformWorld, ungroupElements, worldMatrix,
  expandStroke, offsetPath, allElementIds, moveElement, solidOf, hitTestChildren, childrenInRect, addGuide, moveGuide, removeGuide, clearGuides, booleanOperation, makeCompoundPath, releaseCompoundPaths, type BooleanOp,
  patchText, textOnPath, releaseTextPath, type TextPatch,
  alignElements, distributeElements, makeClippingMask, releaseClippingMask, type AlignMode, type DistributeMode,
  type Artboard, type Element, type Paint, type PathElement, type Stroke, type VDocument, type ZOrder,
} from '../core/document';
import { apply, applyVector, translate } from '../core/geometry/matrix';
import type { Matrix, PathNode, Rect, Vec } from '../core/geometry/types';
import { Viewport } from './viewport';
import type { OverlayModel, PointerInfo, Tool, ToolId } from './types';
import { createTools } from './tools';
import { collectTargets, snapBoxMove, snapPointTo, type SnapTargets } from './snap';

export interface DefaultStyle {
  fill: Paint | null;
  stroke: Stroke | null;
}

type Listener = () => void;

/** Width of the ruler strips in CSS px (drawn by the canvas view). */
export const RULER = 20;

/**
 * Editor controller: owns the document history, selection, viewport and active tool.
 * It has no DOM dependency, so every interaction can be driven by tests via pointerDown/Move/Up.
 */
export class Editor {
  history: History<VDocument>;
  viewport = new Viewport();
  tools: Record<ToolId, Tool>;
  toolId: ToolId = 'select';
  selection: string[] = [];
  /** Direct-selection: selected node indices per element id. */
  nodeSelection: Record<string, number[]> = {};
  activeLayerId: string;
  activeArtboardId: string;
  style: DefaultStyle = { fill: solid('#ffffff'), stroke: defaultStroke('#000000', 1) };
  /** True once the user picked a fill themselves; new text uses it, otherwise text is black (the default fill is white). */
  fillChosen = false;
  clipboard: Element[] = [];
  /** Name shown in the title bar / used for save. */
  fileName: string | null = null;
  /** Full path when known (Electron). */
  filePath: string | null = null;
  version = 0;
  hover: Vec | null = null;
  status = '';

  // Transient visuals owned by tools.
  marquee: Rect | null = null;
  rubber: Rect | null = null;
  penPreview: OverlayModel['pen'] = null;
  dragging = false;
  /** Bumped when the UI should focus the text editor in the Typography panel. */
  textFocusTick = 0;
  /** True while the in-place text box over the canvas is open. */
  textEditing = false;
  /** Group being edited in isolation mode (only its children can be picked; the rest is dimmed). */
  isolation: string | null = null;
  // Rulers, guides, snapping
  snapEnabled = true;
  showRulers = true;
  /** Active snap lines to draw while dragging (document coordinates). */
  snapLines: { x: number | null; y: number | null } = { x: null, y: null };
  private guideDrag: { id: string; created: boolean } | null = null;

  private listeners = new Set<Listener>();
  private panStart: { sx: number; sy: number; px: number; py: number } | null = null;

  constructor(doc: VDocument = createDocument('Untitled-1', 1920, 1080)) {
    this.history = new History(doc);
    this.tools = createTools();
    this.activeLayerId = doc.layers[0].id;
    this.activeArtboardId = doc.artboards[0].id;
  }

  // ---- state plumbing ----
  get doc(): VDocument { return this.history.doc; }
  get tool(): Tool { return this.tools[this.toolId]; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.prune();
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private prune(): void {
    const doc = this.doc;
    const ids = new Set(allElementIds(doc));
    if (this.isolation && !ids.has(this.isolation)) this.isolation = null;
    this.selection = this.selection.filter((id) => ids.has(id));
    if (this.textEditing && this.selectedTexts.length !== 1) this.textEditing = false;
    for (const id of Object.keys(this.nodeSelection)) if (!ids.has(id) || !this.selection.includes(id)) delete this.nodeSelection[id];
    if (!doc.layers.some((l) => l.id === this.activeLayerId)) this.activeLayerId = doc.layers[doc.layers.length - 1].id;
    if (!doc.artboards.some((a) => a.id === this.activeArtboardId)) this.activeArtboardId = doc.artboards[0].id;
  }

  setStatus(msg: string): void {
    this.status = msg;
    this.emit();
  }

  /** Undoable document change. */
  apply(label: string, recipe: (d: VDocument) => void): boolean {
    const changed = this.history.apply(label, recipe);
    this.emit();
    return changed;
  }

  // ---- document lifecycle ----
  loadDocument(doc: VDocument, fileName: string | null): void {
    this.cancelGesture();
    this.isolation = null;
    this.history.reset(doc);
    this.selection = [];
    this.nodeSelection = {};
    this.fileName = fileName;
    this.activeLayerId = doc.layers[doc.layers.length - 1].id;
    this.activeArtboardId = doc.artboards[0].id;
    this.fitArtboard();
    this.emit();
  }

  newDocument(name: string, w: number, h: number, background: string | null = '#ffffff'): void {
    const doc = createDocument(name, w, h);
    doc.artboards[0].background = background;
    this.loadDocument(doc, null);
  }

  // ---- tools & pointer ----
  setTool(id: ToolId): void {
    if (id === this.toolId) return;
    this.cancelGesture();
    this.tool.cancel?.(this);
    this.toolId = id;
    this.emit();
  }

  hitTol(px = 5): number { return px / this.viewport.zoom; }

  // ---- snapping ----
  snapTargets(exclude: Iterable<string> = []): SnapTargets { return collectTargets(this.doc, new Set(exclude)); }
  snapPoint(p: Vec, t: SnapTargets, bypass = false): Vec {
    if (!this.snapEnabled || bypass) { this.snapLines = { x: null, y: null }; return p; }
    const r = snapPointTo(p, t, this.hitTol(6));
    this.snapLines = { x: r.lineX, y: r.lineY };
    return r.value;
  }
  snapMove(b: Rect, dx: number, dy: number, t: SnapTargets, lockX = false, lockY = false, bypass = false): { dx: number; dy: number } {
    if (!this.snapEnabled || bypass) { this.snapLines = { x: null, y: null }; return { dx, dy }; }
    const r = snapBoxMove(b, dx, dy, t, this.hitTol(6), lockX, lockY);
    this.snapLines = { x: r.lineX, y: r.lineY };
    return r.value;
  }

  // ---- guides ----
  /** Start dragging a new guide out of a ruler (`axis` 'v' = from the left ruler). */
  beginNewGuide(axis: 'v' | 'h', sx: number, sy: number): void {
    const p = this.viewport.toDoc(sx, sy);
    this.history.begin();
    let id = '';
    this.history.update((d) => { id = addGuide(d, axis, axis === 'v' ? p.x : p.y); });
    this.guideDrag = { id, created: true };
    this.emit();
  }
  /** Pointer went down on a ruler strip: drag a new guide out of it. */
  startRulerDrag(axis: 'v' | 'h', sx: number, sy: number): void {
    this.dragging = true;
    this.beginNewGuide(axis, sx, sy);
  }
  /** Returns true if a guide is under the screen point and a drag of it has started. */
  tryBeginGuideDrag(sx: number, sy: number): boolean {
    if (!this.showRulers) return false;
    const p = this.viewport.toDoc(sx, sy), tol = this.hitTol(4);
    const g = (this.doc.guides ?? []).find((x) => Math.abs((x.axis === 'v' ? p.x : p.y) - x.pos) <= tol);
    if (!g) return false;
    this.history.begin();
    this.guideDrag = { id: g.id, created: false };
    return true;
  }
  get draggingGuide(): boolean { return this.guideDrag !== null; }
  moveGuideTo(sx: number, sy: number): void {
    if (!this.guideDrag) return;
    const g = this.doc.guides?.find((x) => x.id === this.guideDrag!.id);
    if (!g) return;
    const p = this.viewport.toDoc(sx, sy);
    const pos = g.axis === 'v' ? p.x : p.y;
    this.history.update((d) => moveGuide(d, g.id, pos));
    this.emit();
  }
  /** Finish a guide drag. Releasing over the ruler strip (`overRuler`) deletes the guide. */
  endGuideDrag(overRuler: boolean): void {
    if (!this.guideDrag) return;
    const { id, created } = this.guideDrag;
    this.guideDrag = null;
    if (overRuler) this.history.update((d) => removeGuide(d, id));
    this.history.commit(overRuler ? 'Delete guide' : created ? 'Add guide' : 'Move guide');
    this.emit();
  }
  clearGuides(): void { this.apply('Clear guides', (d) => clearGuides(d)); }
  toggleSnap(): void { this.snapEnabled = !this.snapEnabled; this.emit(); }
  toggleRulers(): void { this.showRulers = !this.showRulers; this.emit(); }

  private info(sx: number, sy: number, m: { shift?: boolean; alt?: boolean; ctrl?: boolean; detail?: number }): PointerInfo {
    return { p: this.viewport.toDoc(sx, sy), screen: { x: sx, y: sy }, shift: !!m.shift, alt: !!m.alt, ctrl: !!m.ctrl, detail: m.detail ?? 1 };
  }

  pointerDown(sx: number, sy: number, m: { shift?: boolean; alt?: boolean; ctrl?: boolean; detail?: number } = {}): void {
    if (this.tryBeginGuideDrag(sx, sy)) { this.dragging = true; this.emit(); return; }
    this.dragging = true;
    this.tool.down(this, this.info(sx, sy, m));
    this.emit();
  }
  pointerMove(sx: number, sy: number, m: { shift?: boolean; alt?: boolean; ctrl?: boolean } = {}): void {
    const e = this.info(sx, sy, m);
    this.hover = e.p;
    if (this.guideDrag) this.moveGuideTo(sx, sy);
    else if (this.dragging) this.tool.move(this, e);
    else if (this.toolId === 'pen') this.tool.move(this, e);
    this.emit();
  }
  pointerUp(sx: number, sy: number, m: { shift?: boolean; alt?: boolean; ctrl?: boolean } = {}): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.guideDrag) { this.endGuideDrag(sx < RULER || sy < RULER); this.snapLines = { x: null, y: null }; this.emit(); return; }
    this.tool.up(this, this.info(sx, sy, m));
    this.snapLines = { x: null, y: null };
    this.emit();
  }

  /** Abort any in-progress gesture, restoring the document to its pre-gesture state. */
  cancelGesture(): void {
    this.dragging = false;
    this.guideDrag = null;
    this.snapLines = { x: null, y: null };
    this.marquee = null;
    this.rubber = null;
    this.tool.cancel?.(this);
    if (this.history.inTransaction) this.history.cancel();
    this.emit();
  }

  /** Returns true if the active tool consumed the key. */
  toolKey(key: string, mods: { shift: boolean; alt: boolean; ctrl: boolean }): boolean {
    const r = this.tool.key?.(this, key, mods) ?? false;
    if (r) this.emit();
    return r;
  }

  panBegin(sx: number, sy: number): void {
    this.panStart = { sx, sy, px: this.viewport.panX, py: this.viewport.panY };
  }
  panMove(sx: number, sy: number): void {
    const s = this.panStart;
    if (!s) return;
    this.viewport.panX = s.px + (sx - s.sx);
    this.viewport.panY = s.py + (sy - s.sy);
    this.emit();
  }
  panEnd(): void { this.panStart = null; }
  get panning(): boolean { return this.panStart !== null; }

  wheelZoom(sx: number, sy: number, deltaY: number): void {
    this.viewport.zoomAt(sx, sy, Math.exp(-deltaY * 0.0015));
    this.emit();
  }
  wheelPan(dx: number, dy: number): void {
    this.viewport.panBy(-dx, -dy);
    this.emit();
  }
  zoomBy(factor: number): void {
    this.viewport.zoomAt(this.viewport.width / 2, this.viewport.height / 2, factor);
    this.emit();
  }
  zoomTo(z: number): void {
    this.viewport.setZoomCentered(z);
    this.emit();
  }
  get activeArtboard(): Artboard {
    return this.doc.artboards.find((a) => a.id === this.activeArtboardId) ?? this.doc.artboards[0];
  }
  fitArtboard(): void {
    const a = this.activeArtboard;
    this.viewport.fit({ x: a.x, y: a.y, w: a.w, h: a.h });
    this.emit();
  }
  fitAll(): void {
    const abs = this.doc.artboards;
    const x = Math.min(...abs.map((a) => a.x)), y = Math.min(...abs.map((a) => a.y));
    const r = Math.max(...abs.map((a) => a.x + a.w)), b = Math.max(...abs.map((a) => a.y + a.h));
    this.viewport.fit({ x, y, w: r - x, h: b - y });
    this.emit();
  }

  // ---- selection ----
  select(ids: string[], additive = false): void {
    const next = additive ? [...new Set([...this.selection, ...ids])] : [...new Set(ids)];
    this.selection = next;
    this.nodeSelection = {};
    const first = next[0] ? locate(this.doc, next[0]) : null;
    if (first) this.activeLayerId = first.layer.id;
    this.emit();
  }
  clearSelection(): void { this.select([]); }
  selectAll(): void {
    if (this.isolation) {
      const g = getElement(this.doc, this.isolation);
      this.select(g && g.type === 'group' ? g.children.filter((c) => c.visible && !c.locked).map((c) => c.id) : []);
      return;
    }
    const ids: string[] = [];
    for (const l of this.doc.layers) if (l.visible && !l.locked) for (const e of l.children) if (e.visible && !e.locked) ids.push(e.id);
    this.select(ids);
  }
  toggleSelect(id: string): void {
    this.select(this.selection.includes(id) ? this.selection.filter((s) => s !== id) : [...this.selection, id]);
  }
  get selectedElements(): Element[] {
    return this.selection.map((id) => getElement(this.doc, id)).filter((e): e is Element => !!e);
  }
  selectionBounds(): Rect | null { return selectionBounds(this.doc, this.selection); }

  // ---- node selection helpers (direct selection) ----
  selectedNodeIndices(id: string): number[] { return this.nodeSelection[id] ?? []; }
  hasNodeSelection(): boolean { return Object.values(this.nodeSelection).some((a) => a.length > 0); }
  setNodeSelection(sel: Record<string, number[]>): void { this.nodeSelection = sel; this.emit(); }

  /** World-space nodes of an element (rect/ellipse expanded). */
  worldNodes(id: string): { nodes: PathNode[]; closed: boolean } | null {
    const el = getElement(this.doc, id);
    if (!el || el.type === 'group') return null;
    const W = worldMatrix(this.doc, id);
    const nodes = elementNodes(el).map((n) => {
      const p = apply(W, n);
      const i = applyVector(W, { x: n.inX, y: n.inY });
      const o = applyVector(W, { x: n.outX, y: n.outY });
      return { x: p.x, y: p.y, inX: i.x, inY: i.y, outX: o.x, outY: o.y };
    });
    return { nodes, closed: el.type !== 'path' || el.closed };
  }

  // ---- commands on the document ----
  deleteSelection(): void {
    if (this.toolId === 'direct' && this.hasNodeSelection()) { this.deleteSelectedNodes(); return; }
    if (!this.selection.length) return;
    const ids = [...this.selection];
    this.apply('Delete', (d) => removeElements(d, ids));
  }

  deleteSelectedNodes(): void {
    const sel = this.nodeSelection;
    this.apply('Delete anchor points', (d) => {
      for (const [id, idx] of Object.entries(sel)) {
        const loc = locate(d, id);
        if (!loc || loc.element.type === 'group' || idx.length === 0) continue;
        const nodes = elementNodes(loc.element).filter((_, i) => !idx.includes(i)).map((n) => ({ ...n }));
        if (nodes.length < 2) loc.siblings.splice(loc.index, 1);
        else setPathNodes(d, id, nodes);
      }
    });
    this.nodeSelection = {};
    this.emit();
  }

  duplicateSelection(dx = 0, dy = 0): void {
    if (!this.selection.length) return;
    const ids = [...this.selection];
    let copies: string[] = [];
    this.apply('Duplicate', (d) => { copies = duplicateElements(d, ids, dx, dy); });
    this.select(copies);
  }

  copy(): void {
    const els = this.selectedElements;
    if (!els.length) return;
    // Bake ancestor transforms so pasted copies keep their position.
    this.clipboard = els.map((e) => {
      const pm = parentMatrix(this.doc, e.id);
      return structuredClone({ ...e, transform: mul(pm, e.transform) }) as Element;
    });
    this.setStatus(`Copied ${els.length} object${els.length > 1 ? 's' : ''}`);
  }
  cut(): void {
    if (!this.selection.length) return;
    this.copy();
    this.deleteSelection();
  }
  paste(inPlace = false): void {
    if (!this.clipboard.length) return;
    let ids: string[] = [];
    const off = inPlace ? 0 : 10;
    this.apply('Paste', (d) => { ids = insertCopies(d, this.clipboard, this.activeLayerId, off, off); });
    this.select(ids);
  }

  group(): void {
    if (this.selection.length < 2) return;
    let gid: string | null = null;
    const ids = [...this.selection];
    this.apply('Group', (d) => { gid = groupElements(d, ids); });
    if (gid) this.select([gid]);
  }
  ungroup(): void {
    const ids = this.selection.filter((id) => getElement(this.doc, id)?.type === 'group');
    if (!ids.length) return;
    let out: string[] = [];
    this.apply('Ungroup', (d) => { out = ungroupElements(d, ids); });
    this.select(out);
  }
  arrange(where: ZOrder): void {
    if (!this.selection.length) return;
    const ids = [...this.selection];
    this.apply('Arrange', (d) => reorder(d, ids, where));
  }

  /** Move selection (or selected nodes) by a document-space delta. */
  nudge(dx: number, dy: number): void {
    if (this.toolId === 'direct' && this.hasNodeSelection()) {
      const sel = this.nodeSelection;
      this.apply('Nudge anchor points', (d) => {
        for (const [id, idx] of Object.entries(sel)) {
          const loc = locate(d, id);
          if (!loc || loc.element.type === 'group') continue;
          const W = worldMatrix(d, id);
          const inv = invertLinear(W);
          if (!inv) continue;
          const ld = applyVector(inv, { x: dx, y: dy });
          const nodes = elementNodes(loc.element).map((n, i) => (idx.includes(i) ? { ...n, x: n.x + ld.x, y: n.y + ld.y } : { ...n }));
          setPathNodes(d, id, nodes);
        }
      });
      return;
    }
    if (!this.selection.length) return;
    const ids = [...this.selection];
    this.apply('Nudge', (d) => transformWorld(d, ids, translate(dx, dy)));
  }

  transformSelection(m: Matrix, label = 'Transform'): void {
    const ids = [...this.selection];
    if (ids.length) this.apply(label, (d) => transformWorld(d, ids, m));
  }

  /** Boolean operation on the selection. Returns false (with a status message) if nothing could be produced. */
  boolean(op: BooleanOp): boolean {
    if (this.selection.length < 2) return false;
    const ids = [...this.selection];
    let res: string | null = null;
    this.apply(`Boolean: ${op}`, (d) => { res = booleanOperation(d, ids, op); });
    if (!res) { this.setStatus('The result of that operation is empty, nothing changed'); return false; }
    this.select([res]);
    return true;
  }
  makeCompound(): void {
    if (this.selection.length < 2) return;
    const ids = [...this.selection];
    let res: string | null = null;
    this.apply('Make compound path', (d) => { res = makeCompoundPath(d, ids); });
    if (res) this.select([res]);
  }
  releaseCompound(): void {
    const ids = [...this.selection];
    let out: string[] = [];
    this.apply('Release compound path', (d) => { out = releaseCompoundPaths(d, ids); });
    if (out.length) this.select(out);
  }

  /** Align the selection to itself, or to the active artboard when `toArtboard` (or only one object is selected). */
  align(mode: AlignMode, toArtboard = false): void {
    if (!this.selection.length) return;
    const ids = [...this.selection];
    const a = this.activeArtboard;
    const ref = toArtboard || ids.length === 1 ? { x: a.x, y: a.y, w: a.w, h: a.h } : undefined;
    this.apply('Align', (d) => alignElements(d, ids, mode, ref));
  }
  distribute(mode: DistributeMode): void {
    if (this.selection.length < 3) return;
    const ids = [...this.selection];
    this.apply('Distribute', (d) => distributeElements(d, ids, mode));
  }
  makeClip(): void {
    if (this.selection.length < 2) return;
    const ids = [...this.selection];
    let res: string | null = null;
    this.apply('Make clipping mask', (d) => { res = makeClippingMask(d, ids); });
    if (res) this.select([res]); else this.setStatus('A clipping mask needs two or more objects with a shape on top');
  }
  releaseClip(): void {
    const ids = this.selection.filter((id) => { const e = getElement(this.doc, id); return e?.type === 'group' && e.clip; });
    if (!ids.length) return;
    this.apply('Release clipping mask', (d) => ids.forEach((id) => releaseClippingMask(d, id)));
  }

  /** Turn strokes of the selected shapes into filled outlines. Returns how many objects were expanded. */
  expandStrokes(): number {
    const ids = this.selection.filter((id) => { const e = getElement(this.doc, id); return !!e && e.type !== 'group' && !!e.stroke && e.stroke.width > 0; });
    if (!ids.length) { this.setStatus('Select a shape that has a stroke to expand'); return 0; }
    const out: string[] = [];
    this.apply('Expand stroke', (d) => { for (const id of ids) { const r = expandStroke(d, id); if (r) out.push(r); } });
    this.select(out);
    return out.length;
  }
  /** Grow (positive) or shrink (negative) the selected shapes' outlines. New paths are placed above the originals. */
  offsetSelection(distance: number, join: 'round' | 'miter' | 'bevel'): number {
    const ids = [...this.selection];
    const out: string[] = [];
    this.apply('Offset path', (d) => { for (const id of ids) { const r = offsetPath(d, id, distance, join); if (r) out.push(r); } });
    if (!out.length) { this.setStatus('Nothing to offset (select closed shapes; shrinking may remove them)'); return 0; }
    this.select(out);
    return out.length;
  }

  convertSelectionToPaths(): void {
    const ids = this.selection.filter((id) => { const t = getElement(this.doc, id)?.type; return t === 'rect' || t === 'ellipse' || t === 'text'; });
    if (!ids.length) return;
    const hasText = ids.some((id) => getElement(this.doc, id)?.type === 'text');
    this.apply(hasText ? 'Create outlines' : 'Convert to path', (d) => ids.forEach((id) => convertToPath(d, id)));
  }

  // ---- text ----
  requestTextFocus(): void { this.textEditing = true; this.textFocusTick++; this.emit(); }
  closeTextEditor(): void { if (this.textEditing) { this.textEditing = false; this.emit(); } }
  get selectedTexts(): Extract<Element, { type: 'text' }>[] {
    return this.selectedElements.filter((e): e is Extract<Element, { type: 'text' }> => e.type === 'text');
  }
  setTextProps(patch: TextPatch, label = 'Edit text'): void {
    const ids = this.selectedTexts.map((t) => t.id);
    if (ids.length) this.apply(label, (d) => patchText(d, ids, patch));
  }
  /** Live (non-committing) edit while typing; call endTextEdit to close it as one undo step. */
  beginTextEdit(): void { this.history.begin(); }
  liveTextEdit(patch: TextPatch): void {
    const ids = this.selectedTexts.map((t) => t.id);
    if (!ids.length) return;
    this.history.begin();
    this.history.update((d) => patchText(d, ids, patch));
    this.emit();
  }
  endTextEdit(): void { if (this.history.commit('Edit text')) this.emit(); }
  makeTextOnPath(): boolean {
    const texts = this.selectedTexts;
    const path = this.selectedElements.find((e) => e.type === 'path');
    if (texts.length !== 1 || !path) { this.setStatus('Select one text object and one path to put text on a path'); return false; }
    let ok = false;
    const tid = texts[0].id, pid = path.id;
    this.apply('Text on path', (d) => { ok = textOnPath(d, tid, pid); });
    if (ok) this.select([tid]);
    return ok;
  }
  releaseTextFromPath(): void {
    const ids = this.selectedTexts.filter((t) => t.path).map((t) => t.id);
    if (!ids.length) return;
    this.apply('Release text from path', (d) => ids.forEach((id) => releaseTextPath(d, id)));
  }

  // ---- appearance ----
  firstShape(): Exclude<Element, { type: 'group' }> | null {
    const walk = (els: Element[]): Exclude<Element, { type: 'group' }> | null => {
      for (const e of els) {
        if (e.type !== 'group') return e;
        const r = walk(e.children);
        if (r) return r;
      }
      return null;
    };
    return walk(this.selectedElements);
  }

  get currentFill(): Paint | null { return this.selection.length ? this.firstShape()?.fill ?? null : this.style.fill; }
  get currentStroke(): Stroke | null { return this.selection.length ? this.firstShape()?.stroke ?? null : this.style.stroke; }

  setFill(fill: Paint | null): void {
    this.fillChosen = true;
    this.style = { ...this.style, fill };
    if (this.selection.length) this.apply('Change fill', (d) => patchElements(d, this.selection, { fill }));
    else this.emit();
  }

  /** Merge changes into the stroke of every selected shape (creating a default stroke if there is none). */
  updateStroke(change: Partial<Stroke> | null): void {
    const merge = (cur: Stroke | null): Stroke | null => (change === null ? null : { ...(cur ?? defaultStroke()), ...change });
    this.style = { ...this.style, stroke: merge(this.style.stroke) };
    if (!this.selection.length) { this.emit(); return; }
    const ids = [...this.selection];
    this.apply('Change stroke', (d) => {
      const walk = (id: string) => {
        const el = getElement(d, id);
        if (!el) return;
        if (el.type === 'group') el.children.forEach((c) => walk(c.id));
        else el.stroke = merge(el.stroke);
      };
      ids.forEach(walk);
    });
  }

  swapFillStroke(): void {
    const fill = this.currentFill, stroke = this.currentStroke;
    const nf = stroke ? { ...stroke.paint } : null;
    const ns = fill ? { ...(stroke ?? defaultStroke()), paint: solidOf(fill) } : null;
    this.style = { fill: nf, stroke: ns };
    if (this.selection.length) {
      const ids = [...this.selection];
      this.apply('Swap fill and stroke', (d) => {
        const walk = (id: string) => {
          const el = getElement(d, id);
          if (!el) return;
          if (el.type === 'group') el.children.forEach((c) => walk(c.id));
          else { el.fill = nf; el.stroke = ns; }
        };
        ids.forEach(walk);
      });
    } else this.emit();
  }

  setOpacity(opacity: number): void {
    if (this.selection.length) this.apply('Change opacity', (d) => patchElements(d, this.selection, { opacity }));
  }

  /** Set an element's geometry from the Properties panel (world-space X/Y/W/H of its bounds). */
  setBounds(target: Partial<Rect>): void {
    const b = this.selectionBounds();
    if (!b || !this.selection.length) return;
    const nx = target.x ?? b.x, ny = target.y ?? b.y;
    const nw = target.w ?? b.w, nh = target.h ?? b.h;
    if (!(nw > 0) || !(nh > 0)) return;
    const sx = b.w > 0 ? nw / b.w : 1, sy = b.h > 0 ? nh / b.h : 1;
    const m: Matrix = [sx, 0, 0, sy, nx - b.x * sx, ny - b.y * sy];
    this.transformSelection(m, 'Set position / size');
  }

  // ---- layers / artboards ----
  addLayer(): void {
    let id = '';
    this.apply('Add layer', (d) => { id = addLayer(d); });
    this.activeLayerId = id;
    this.emit();
  }
  removeLayer(id: string): void { this.apply('Delete layer', (d) => removeLayer(d, id)); }
  patchLayer(id: string, patch: { name?: string; visible?: boolean; locked?: boolean }): void {
    this.apply('Edit layer', (d) => patchLayer(d, id, patch));
  }
  moveLayer(id: string, toIndex: number): void { this.apply('Reorder layer', (d) => moveLayer(d, id, toIndex)); }
  patchElement(id: string, patch: { name?: string; visible?: boolean; locked?: boolean }): void {
    this.apply('Edit object', (d) => patchElements(d, [id], patch));
  }
  moveElementTo(id: string, layerId: string, index: number): void { this.apply('Move object', (d) => moveElement(d, id, layerId, index)); }

  addArtboard(name: string, w: number, h: number, background: string | null = '#ffffff'): void {
    let id = '';
    this.apply('Add artboard', (d) => { id = addArtboard(d, name, w, h, background); });
    this.activeArtboardId = id;
    this.emit();
  }
  patchArtboard(id: string, patch: Partial<Omit<Artboard, 'id'>>): void { this.apply('Edit artboard', (d) => patchArtboard(d, id, patch)); }
  removeArtboard(id: string): void { this.apply('Delete artboard', (d) => removeArtboard(d, id)); }

  undo(): void { this.cancelGestureIfAny(); if (this.history.undo()) this.emit(); }
  redo(): void { this.cancelGestureIfAny(); if (this.history.redo()) this.emit(); }
  private cancelGestureIfAny(): void { if (this.history.inTransaction) this.cancelGesture(); }

  // ---- add content helper used by tools ----
  addShape(el: Element, label: string): void {
    this.apply(label, (d) => addElement(d, el, this.activeLayerId));
    this.select([el.id]);
  }

  // ---- overlay ----
  getOverlay(): OverlayModel {
    const outlines: OverlayModel['outlines'] = [];
    const anchors: OverlayModel['anchors'] = [];
    const showNodes = this.toolId === 'direct';
    const walk = (el: Element) => {
      if (el.type === 'group') { el.children.forEach(walk); return; }
      const wn = this.worldNodes(el.id);
      if (!wn) return;
      outlines.push(wn);
      if (showNodes) {
        const sel = new Set(this.selectedNodeIndices(el.id));
        anchors.push(wn.nodes.map((n, i) => ({
          x: n.x, y: n.y, selected: sel.has(i),
          hIn: sel.has(i) && (n.inX || n.inY) ? { x: n.x + n.inX, y: n.y + n.inY } : null,
          hOut: sel.has(i) && (n.outX || n.outY) ? { x: n.x + n.outX, y: n.y + n.outY } : null,
        })));
      }
    };
    this.selectedElements.forEach(walk);
    return {
      outlines,
      bbox: this.toolId === 'select' ? this.selectionBounds() : null,
      anchors,
      marquee: this.marquee,
      pen: this.penPreview,
      rubber: this.rubber,
    };
  }

  /** Helpers used by tools / tests. */
  hit(p: Vec, deep = false): string | null {
    return this.isolation ? hitTestChildren(this.doc, this.isolation, p, this.hitTol()) : hitTest(this.doc, p, this.hitTol(), deep);
  }
  inRect(r: Rect): string[] { return this.isolation ? childrenInRect(this.doc, this.isolation, r) : elementsInRect(this.doc, r); }

  enterIsolation(groupId: string): void {
    const g = getElement(this.doc, groupId);
    if (!g || g.type !== 'group') return;
    this.isolation = groupId;
    this.select([]);
    this.setStatus(`Isolation mode: ${g.name} (Esc or double-click empty space to exit)`);
  }
  exitIsolation(): void {
    if (!this.isolation) return;
    const id = this.isolation;
    this.isolation = null;
    this.select(getElement(this.doc, id) ? [id] : []);
    this.setStatus('');
  }
  boundsOf(id: string): Rect | null { const e = getElement(this.doc, id); return e ? elementBounds(e) : null; }
  pathOf(id: string): PathElement | null {
    const e = getElement(this.doc, id);
    return e && e.type === 'path' ? e : null;
  }
}

const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

export function invertLinear(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, 0, 0];
}

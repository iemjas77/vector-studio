import { createArtboard, linearGradient, defaultStops, solidOf, type Element, type Paint } from '../../core/document';
import type { Rect, Vec } from '../../core/geometry/types';
import type { Tool } from '../types';

/** Eyedropper: click an object to copy its fill, stroke and opacity onto the selection (or onto the default style). */
export function eyedropperTool(): Tool {
  return {
    id: 'eyedropper', label: 'Eyedropper', shortcut: 'I',
    cursor: () => 'copy',
    down(ed, e) {
      const id = ed.hit(e.p, true);
      if (!id) return;
      ed.sampleAppearance(id);
    },
    move() {}, up() {},
  };
}

/** Magic Wand: select everything with the same fill (shift adds, alt = match stroke instead). */
export function wandTool(): Tool {
  return {
    id: 'wand', label: 'Magic Wand', shortcut: 'Y',
    cursor: () => 'crosshair',
    down(ed, e) {
      const id = ed.hit(e.p, true);
      if (!id) { if (!e.shift) ed.clearSelection(); return; }
      ed.selectSimilar(id, e.alt ? 'stroke' : 'fill', e.shift);
    },
    move() {}, up() {},
  };
}

/** Lasso: drag a free-form loop; objects with an anchor (or their centre) inside it are selected. */
export function lassoTool(): Tool {
  let pts: Vec[] = [];
  let shift = false;
  return {
    id: 'lasso', label: 'Lasso', shortcut: 'Q',
    cursor: () => 'crosshair',
    down(ed, e) { pts = [e.p]; shift = e.shift; ed.lasso = pts; if (!e.shift) ed.select([]); },
    move(ed, e) {
      const last = pts[pts.length - 1];
      if (Math.hypot(e.p.x - last.x, e.p.y - last.y) * ed.viewport.zoom < 3) return;
      pts = [...pts, e.p];
      ed.lasso = pts;
    },
    up(ed) {
      const poly = pts;
      pts = [];
      ed.lasso = null;
      if (poly.length < 3) return;
      const found = ed.topLevelObjects().filter((el) => ed.objectTouchesPolygon(el, poly));
      ed.select(shift ? [...new Set([...ed.selection, ...found.map((f) => f.id)])] : found.map((f) => f.id));
    },
    cancel(ed) { pts = []; ed.lasso = null; },
  };
}

/** Gradient tool: drag across the selected object to set the gradient's direction (linear) or centre and radius (radial). */
export function gradientTool(): Tool {
  let a: Vec | null = null;
  let began = false;
  const paintFor = (el: Element, bounds: Rect, p0: Vec, p1: Vec): Paint | null => {
    if (el.type === 'group') return null;
    const fx = (p: Vec) => (bounds.w > 0 ? (p.x - bounds.x) / bounds.w : 0.5), fy = (p: Vec) => (bounds.h > 0 ? (p.y - bounds.y) / bounds.h : 0.5);
    const cur = el.fill;
    if (cur && cur.type === 'radial') return { ...cur, cx: fx(p0), cy: fy(p0), r: Math.max(0.01, Math.hypot(p1.x - p0.x, p1.y - p0.y) / Math.max(bounds.w, bounds.h, 1e-9)) };
    const stops = cur && cur.type === 'linear' ? cur.stops : defaultStops(cur ? solidOf(cur).color : '#000000', '#ffffff');
    return { ...linearGradient(stops, 0), x1: fx(p0), y1: fy(p0), x2: fx(p1), y2: fy(p1) };
  };
  return {
    id: 'gradient', label: 'Gradient', shortcut: 'G',
    cursor: () => 'crosshair',
    down(ed, e) {
      if (!ed.selection.length) { ed.setStatus('Select an object first, then drag across it with the Gradient tool'); a = null; return; }
      a = e.p; began = false;
    },
    move(ed, e) {
      if (!a) return;
      if (Math.hypot(e.p.x - a.x, e.p.y - a.y) * ed.viewport.zoom < 3) return;
      if (!began) { ed.history.begin(); began = true; }
      ed.history.restoreBase();
      ed.applyGradientDrag(a, e.p, paintFor);
    },
    up(ed) { if (began) ed.history.commit('Gradient'); a = null; began = false; },
    cancel() { a = null; began = false; },
  };
}

/** Artboard tool: drag on empty canvas to make an artboard; drag an artboard to move it with the artwork inside. */
export function artboardTool(): Tool {
  let mode: 'none' | 'create' | 'move' = 'none';
  let start: Vec = { x: 0, y: 0 };
  let abId = '';
  let startRect: Rect | null = null;
  let moved = false;
  return {
    id: 'artboard', label: 'Artboard', shortcut: 'Shift+O',
    cursor: () => 'crosshair',
    down(ed, e) {
      start = e.p; moved = false;
      const hit = [...ed.doc.artboards].reverse().find((a) => e.p.x >= a.x && e.p.x <= a.x + a.w && e.p.y >= a.y && e.p.y <= a.y + a.h);
      if (hit) {
        ed.activeArtboardId = hit.id; abId = hit.id; mode = 'move'; startRect = { x: hit.x, y: hit.y, w: hit.w, h: hit.h };
        ed.history.begin();
      } else { mode = 'create'; abId = ''; startRect = null; ed.rubber = { x: e.p.x, y: e.p.y, w: 0, h: 0 }; }
    },
    move(ed, e) {
      if (mode === 'none') return;
      if (Math.hypot(e.p.x - start.x, e.p.y - start.y) * ed.viewport.zoom < 3 && !moved) return;
      moved = true;
      if (mode === 'create') {
        ed.rubber = { x: Math.min(start.x, e.p.x), y: Math.min(start.y, e.p.y), w: Math.abs(e.p.x - start.x), h: Math.abs(e.p.y - start.y) };
        return;
      }
      ed.history.restoreBase();
      ed.moveArtboardWithArtwork(abId, startRect!, e.p.x - start.x, e.p.y - start.y);
    },
    up(ed, e) {
      if (mode === 'create') {
        const r = { x: Math.min(start.x, e.p.x), y: Math.min(start.y, e.p.y), w: Math.abs(e.p.x - start.x), h: Math.abs(e.p.y - start.y) };
        ed.rubber = null;
        if (r.w >= 8 && r.h >= 8) {
          const a = createArtboard(`Artboard ${ed.doc.artboards.length + 1}`, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
          ed.apply('Create artboard', (d) => { d.artboards.push(a); });
          ed.activeArtboardId = a.id;
        }
      } else if (mode === 'move') ed.history.commit('Move artboard');
      mode = 'none';
    },
    cancel(ed) { ed.rubber = null; mode = 'none'; },
  };
}


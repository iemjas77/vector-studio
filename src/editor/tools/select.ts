import { aboutPoint, rotate, scale, translate } from '../../core/geometry/matrix';
import { duplicateElements, getElement, hitTest, newId, transformWorld } from '../../core/document';
import type { Rect, Vec } from '../../core/geometry/types';
import type { Editor } from '../editor';
import type { SnapTargets } from '../snap';
import type { PointerInfo, Tool } from '../types';

export interface HandleDef { hx: -1 | 0 | 1; hy: -1 | 0 | 1; }
export const HANDLES: HandleDef[] = [
  { hx: -1, hy: -1 }, { hx: 0, hy: -1 }, { hx: 1, hy: -1 }, { hx: 1, hy: 0 },
  { hx: 1, hy: 1 }, { hx: 0, hy: 1 }, { hx: -1, hy: 1 }, { hx: -1, hy: 0 },
];
export const handlePoint = (b: Rect, h: HandleDef): Vec => ({ x: b.x + ((h.hx + 1) / 2) * b.w, y: b.y + ((h.hy + 1) / 2) * b.h });

export function handleCursor(h: HandleDef): string {
  if (h.hx === 0) return 'ns-resize';
  if (h.hy === 0) return 'ew-resize';
  return h.hx === h.hy ? 'nwse-resize' : 'nesw-resize';
}

type Mode = 'none' | 'move' | 'marquee' | 'scale' | 'rotate';
const DRAG_THRESHOLD = 3; // screen px

export function selectTool(): Tool {
  let mode: Mode = 'none';
  let start: Vec = { x: 0, y: 0 };
  let startScreen: Vec = { x: 0, y: 0 };
  let moved = false;
  let ids: string[] = [];
  let bbox: Rect | null = null;
  let handle: HandleDef | null = null;
  let shiftOnDown = false;
  let toggledOff = false;
  let altCopy = false;
  let snapT: SnapTargets = { xs: [], ys: [] };
  let bbox0: Rect | null = null;
  let dupIds: string[] = [];

  const reset = () => { mode = 'none'; moved = false; handle = null; toggledOff = false; altCopy = false; dupIds = []; };

  return {
    id: 'select', label: 'Selection', shortcut: 'V',
    cursor(ed, hover) {
      if (!hover) return 'default';
      const b = ed.selectionBounds();
      if (b) {
        const tol = ed.hitTol(7);
        for (const h of HANDLES) {
          const hp = handlePoint(b, h);
          if (Math.hypot(hp.x - hover.x, hp.y - hover.y) <= tol) return handleCursor(h);
        }
      }
      return ed.hit(hover) ? 'move' : 'default';
    },
    down(ed, e) {
      reset();
      start = e.p; startScreen = e.screen; shiftOnDown = e.shift;
      const b = ed.selectionBounds();
      if (b && ed.selection.length) {
        const tol = ed.hitTol(7);
        for (const h of HANDLES) {
          const hp = handlePoint(b, h);
          if (Math.hypot(hp.x - e.p.x, hp.y - e.p.y) <= tol) {
            mode = 'scale'; handle = h; bbox = b; ids = [...ed.selection]; snapT = ed.snapTargets(ids);
            ed.history.begin();
            return;
          }
        }
        // Rotation zone: just outside a corner handle.
        const outer = ed.hitTol(22);
        for (const h of HANDLES.filter((x) => x.hx !== 0 && x.hy !== 0)) {
          const hp = handlePoint(b, h);
          const d = Math.hypot(hp.x - e.p.x, hp.y - e.p.y);
          const outside = (e.p.x - hp.x) * h.hx > -1e-9 || (e.p.y - hp.y) * h.hy > -1e-9;
          if (d <= outer && outside && !hitTest(ed.doc, e.p, ed.hitTol(), false)) {
            mode = 'rotate'; bbox = b; ids = [...ed.selection];
            ed.history.begin();
            return;
          }
        }
      }
      const hit = ed.hit(e.p, false);
      if (e.detail >= 2) {
        if (hit && getElement(ed.doc, hit)?.type === 'group') { ed.enterIsolation(hit); return; }
        if (!hit && ed.isolation) { ed.exitIsolation(); return; }
      }
      if (hit) {
        if (e.shift) {
          if (ed.selection.includes(hit)) { toggledOff = true; } else ed.select([...ed.selection, hit]);
        } else if (!ed.selection.includes(hit)) ed.select([hit]);
        mode = 'move';
        ids = [...ed.selection];
        snapT = ed.snapTargets(ids);
        bbox0 = ed.selectionBounds();
        ed.history.begin();
        altCopy = e.alt && !toggledOff;
        dupIds = [];
        return;
      }
      if (!e.shift) ed.clearSelection();
      mode = 'marquee';
      ed.marquee = { x: e.p.x, y: e.p.y, w: 0, h: 0 };
    },
    move(ed, e) {
      if (mode === 'none') return;
      if (mode === 'marquee') {
        ed.marquee = normRect(start, e.p);
        return;
      }
      if (!moved && Math.hypot(e.screen.x - startScreen.x, e.screen.y - startScreen.y) < DRAG_THRESHOLD) return;
      moved = true;
      if (mode === 'move') {
        if (toggledOff) return;
        let dx = e.p.x - start.x, dy = e.p.y - start.y;
        if (e.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (bbox0) ({ dx, dy } = ed.snapMove(bbox0, dx, dy, snapT, e.shift && dx === 0, e.shift && dy === 0, e.ctrl));
        ed.history.restoreBase();
        if (altCopy) {
          // Alt-drag: leave the originals and drag copies. Copies keep stable top-level ids across move events.
          if (dupIds.length === 0) dupIds = ids.map(() => newId());
          ed.history.update((d) => {
            duplicateElements(d, ids).forEach((cid, i) => { const el = getElement(d, cid); if (el) el.id = dupIds[i]; });
            transformWorld(d, dupIds, translate(dx, dy));
          });
          ed.selection = dupIds;
        } else ed.history.update((d) => transformWorld(d, ids, translate(dx, dy)));
        return;
      }
      if (!bbox) return;
      if (mode === 'scale' && handle) {
        const h = handle;
        const sp = ed.snapPoint(e.p, snapT, e.ctrl);
        const ax = e.alt || h.hx === 0 ? bbox.x + bbox.w / 2 : bbox.x + ((1 - h.hx) / 2) * bbox.w;
        const ay = e.alt || h.hy === 0 ? bbox.y + bbox.h / 2 : bbox.y + ((1 - h.hy) / 2) * bbox.h;
        const ex = bbox.x + ((h.hx + 1) / 2) * bbox.w, ey = bbox.y + ((h.hy + 1) / 2) * bbox.h;
        let sx = h.hx === 0 || Math.abs(ex - ax) < 1e-9 ? 1 : (sp.x - ax) / (ex - ax);
        let sy = h.hy === 0 || Math.abs(ey - ay) < 1e-9 ? 1 : (sp.y - ay) / (ey - ay);
        if (e.shift) {
          const s = h.hx === 0 ? sy : h.hy === 0 ? sx : Math.max(Math.abs(sx), Math.abs(sy));
          const sgnX = sx < 0 ? -1 : 1, sgnY = sy < 0 ? -1 : 1;
          if (h.hx === 0) { sx = Math.abs(s) * sgnX; sy = s; }
          else if (h.hy === 0) { sy = Math.abs(s) * sgnY; sx = s; }
          else { sx = Math.abs(s) * sgnX; sy = Math.abs(s) * sgnY; }
        }
        if (Math.abs(sx) < 1e-6) sx = 1e-6;
        if (Math.abs(sy) < 1e-6) sy = 1e-6;
        ed.history.restoreBase();
        ed.history.update((d) => transformWorld(d, ids, aboutPoint(scale(sx, sy), { x: ax, y: ay })));
        return;
      }
      if (mode === 'rotate') {
        const c = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
        let delta = Math.atan2(e.p.y - c.y, e.p.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x);
        if (e.shift) { const step = Math.PI / 12; delta = Math.round(delta / step) * step; }
        ed.history.restoreBase();
        ed.history.update((d) => transformWorld(d, ids, aboutPoint(rotate(delta), c)));
      }
    },
    up(ed, e) {
      if (mode === 'marquee') {
        const r = normRect(start, e.p);
        ed.marquee = null;
        if (r.w > 1 / ed.viewport.zoom || r.h > 1 / ed.viewport.zoom) {
          const found = ed.inRect(r);
          ed.select(shiftOnDown ? [...new Set([...ed.selection, ...found])] : found);
        }
      } else if (mode === 'move' || mode === 'scale' || mode === 'rotate') {
        const label = mode === 'move' ? (altCopy && moved ? 'Duplicate and move' : 'Move') : mode === 'scale' ? 'Scale' : 'Rotate';
        if (!moved && toggledOff) ed.select(ed.selection.filter((s) => s !== hitTest(ed.doc, start, ed.hitTol())));
        ed.history.commit(label);
      }
      reset();
    },
    cancel(ed) {
      ed.marquee = null;
      reset();
    },
  };
}

export function normRect(a: Vec, b: Vec): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export type { PointerInfo, Editor };

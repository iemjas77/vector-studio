import { addElement, createEllipse, createRect, newId, type Element } from '../../core/document';
import type { Rect, Vec } from '../../core/geometry/types';
import type { Editor } from '../editor';
import type { PointerInfo, Tool } from '../types';
import type { SnapTargets } from '../snap';

/** Rectangle from drag points: shift = square, alt = from centre. */
export function dragRect(a: Vec, b: Vec, shift: boolean, alt: boolean): Rect {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (shift) {
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * s;
    dy = Math.sign(dy || 1) * s;
  }
  if (alt) return { x: a.x - Math.abs(dx), y: a.y - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 };
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

function shapeTool(kind: 'rect' | 'ellipse'): Tool {
  let start: Vec | null = null;
  let startScreen: Vec = { x: 0, y: 0 };
  let id = '';
  let began = false;
  let targets: SnapTargets = { xs: [], ys: [] };

  const build = (ed: Editor, r: Rect): Element => {
    const fill = ed.style.fill, stroke = ed.style.stroke;
    return kind === 'rect'
      ? createRect(r.x, r.y, r.w, r.h, { id, fill, stroke })
      : createEllipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, { id, fill, stroke });
  };

  return {
    id: kind, label: kind === 'rect' ? 'Rectangle' : 'Ellipse', shortcut: kind === 'rect' ? 'M' : 'L',
    cursor: () => 'crosshair',
    down(ed, e) {
      targets = ed.snapTargets();
      start = ed.snapPoint(e.p, targets, e.ctrl); startScreen = e.screen; id = newId(); began = false;
    },
    move(ed, e: PointerInfo) {
      if (!start) return;
      if (!began && Math.hypot(e.screen.x - startScreen.x, e.screen.y - startScreen.y) < 3) return;
      const r = dragRect(start, ed.snapPoint(e.p, targets, e.ctrl), e.shift, e.alt);
      ed.rubber = r;
      if (r.w < 1e-6 || r.h < 1e-6) return;
      if (!began) { ed.history.begin(); began = true; }
      ed.history.restoreBase();
      const el = build(ed, r);
      ed.history.update((d) => addElement(d, el, ed.activeLayerId));
      ed.selection = [id];
    },
    up(ed, e) {
      ed.rubber = null;
      if (began && start) {
        const r = dragRect(start, ed.snapPoint(e.p, targets, e.ctrl), e.shift, e.alt);
        if (r.w < 0.5 || r.h < 0.5) ed.history.cancel();
        else ed.history.commit(kind === 'rect' ? 'Draw rectangle' : 'Draw ellipse');
        ed.selection = r.w < 0.5 || r.h < 0.5 ? [] : [id];
      }
      start = null; began = false;
    },
    cancel(ed) { ed.rubber = null; start = null; began = false; },
  };
}

export const rectTool = (): Tool => shapeTool('rect');
export const ellipseTool = (): Tool => shapeTool('ellipse');

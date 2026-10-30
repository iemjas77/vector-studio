import { addElement, createPath, createRect, defaultStroke, newId, type Element } from '../../core/document';
import { arcNodes, fitCurve, regularPolygon, spiralNodes, star } from '../../core/geometry/shapes';
import { node } from '../../core/geometry/path';
import type { Vec } from '../../core/geometry/types';
import type { Editor } from '../editor';
import type { SnapTargets } from '../snap';
import type { Tool, ToolId } from '../types';
import { dragRect } from './shapes';

export interface ToolOptions {
  sides: number;
  starPoints: number;
  starRatio: number;
  cornerRadius: number;
  arcSweep: number;
  spiralTurns: number;
  spiralDecay: number;
  /** Pencil fit tolerance in screen pixels. */
  pencilTolerance: number;
}
export const DEFAULT_TOOL_OPTIONS: ToolOptions = { sides: 5, starPoints: 5, starRatio: 0.5, cornerRadius: 16, arcSweep: 90, spiralTurns: 4, spiralDecay: 0.8, pencilTolerance: 3 };

const strokeOnly = (ed: Editor) => ({ fill: null, stroke: ed.style.stroke && ed.style.stroke.width > 0 ? ed.style.stroke : defaultStroke('#000000', 1) });

interface Built { el: Element; label: string }
type Build = (ed: Editor, start: Vec, cur: Vec, m: { shift: boolean; alt: boolean }) => Element | null;

/** Generic click-and-drag shape tool: previews live inside one history transaction, commits on release. */
function dragTool(id: ToolId, label: string, shortcut: string, build: Build, undoLabel: string): Tool {
  let start: Vec | null = null;
  let startScreen: Vec = { x: 0, y: 0 };
  let elId = '';
  let began = false;
  let targets: SnapTargets = { xs: [], ys: [] };
  const make = (ed: Editor, p: Vec, m: { shift: boolean; alt: boolean; ctrl: boolean }): Built | null => {
    const el = build(ed, start!, ed.snapPoint(p, targets, m.ctrl), m);
    return el ? { el: { ...el, id: elId } as Element, label: undoLabel } : null;
  };
  return {
    id, label, shortcut,
    cursor: () => 'crosshair',
    down(ed, e) { targets = ed.snapTargets(); start = ed.snapPoint(e.p, targets, e.ctrl); startScreen = e.screen; elId = newId(); began = false; },
    move(ed, e) {
      if (!start) return;
      if (!began && Math.hypot(e.screen.x - startScreen.x, e.screen.y - startScreen.y) < 3) return;
      const b = make(ed, e.p, e);
      if (!b) return;
      if (!began) { ed.history.begin(); began = true; }
      ed.history.restoreBase();
      ed.history.update((d) => addElement(d, b.el, ed.activeLayerId));
      ed.selection = [elId];
    },
    up(ed, e) {
      if (began && start) {
        const b = make(ed, e.p, e);
        if (!b) { ed.history.cancel(); ed.selection = []; } else ed.history.commit(undoLabel);
      }
      start = null; began = false;
    },
    cancel() { start = null; began = false; },
  };
}

const radiusAngle = (a: Vec, b: Vec, snap: boolean) => {
  const r = Math.hypot(b.x - a.x, b.y - a.y);
  let ang = Math.atan2(b.y - a.y, b.x - a.x);
  if (snap) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
  return { r, ang };
};

export const lineTool = (): Tool => dragTool('line', 'Line Segment', '\\', (ed, a, b, m) => {
  let end = b;
  if (m.shift) { const { r, ang } = radiusAngle(a, b, false); const q = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4); end = { x: a.x + Math.cos(q) * r, y: a.y + Math.sin(q) * r }; }
  if (Math.hypot(end.x - a.x, end.y - a.y) < 0.5) return null;
  return createPath([node(a.x, a.y), node(end.x, end.y)], false, { name: 'Line', ...strokeOnly(ed) });
}, 'Draw line');

export const roundedRectTool = (): Tool => dragTool('rrect', 'Rounded Rectangle', '', (ed, a, b, m) => {
  const r = dragRect(a, b, m.shift, m.alt);
  if (r.w < 0.5 || r.h < 0.5) return null;
  return createRect(r.x, r.y, r.w, r.h, { name: 'Rounded Rectangle', rx: Math.min(ed.toolOptions.cornerRadius, r.w / 2, r.h / 2), fill: ed.style.fill, stroke: ed.style.stroke });
}, 'Draw rounded rectangle');

export const polygonTool = (): Tool => dragTool('polygon', 'Polygon', '', (ed, a, b, m) => {
  const { r, ang } = radiusAngle(a, b, m.shift);
  if (r < 0.5) return null;
  return createPath(regularPolygon(a.x, a.y, r, ed.toolOptions.sides, ang), true, { name: 'Polygon', fill: ed.style.fill, stroke: ed.style.stroke });
}, 'Draw polygon');

export const starTool = (): Tool => dragTool('star', 'Star', '', (ed, a, b, m) => {
  const { r, ang } = radiusAngle(a, b, m.shift);
  if (r < 0.5) return null;
  return createPath(star(a.x, a.y, r, ed.toolOptions.starRatio, ed.toolOptions.starPoints, ang), true, { name: 'Star', fill: ed.style.fill, stroke: ed.style.stroke });
}, 'Draw star');

export const arcTool = (): Tool => dragTool('arc', 'Arc', '', (ed, a, b, m) => {
  const r = dragRect(a, b, m.shift, m.alt);
  if (r.w < 0.5 || r.h < 0.5) return null;
  // The drag box is the ellipse the arc lies on; the arc starts at the right-most point.
  return createPath(arcNodes(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, ed.toolOptions.arcSweep), false, { name: 'Arc', ...strokeOnly(ed) });
}, 'Draw arc');

export const spiralTool = (): Tool => dragTool('spiral', 'Spiral', '', (ed, a, b, m) => {
  const { r, ang } = radiusAngle(a, b, m.shift);
  if (r < 1) return null;
  return createPath(spiralNodes(a.x, a.y, r, ed.toolOptions.spiralTurns, ed.toolOptions.spiralDecay, ang), false, { name: 'Spiral', ...strokeOnly(ed) });
}, 'Draw spiral');

/** Freehand drawing, smoothed into Bezier curves (Schneider fit). */
export function pencilTool(): Tool {
  let pts: Vec[] = [];
  return {
    id: 'pencil', label: 'Pencil', shortcut: 'N',
    cursor: () => 'crosshair',
    down(ed, e) { pts = [e.p]; ed.penPreview = { nodes: [node(e.p.x, e.p.y)], closed: false, cursor: null }; },
    move(ed, e) {
      if (!pts.length) return;
      const last = pts[pts.length - 1];
      if (Math.hypot(e.p.x - last.x, e.p.y - last.y) * ed.viewport.zoom < 2) return;   // ignore sub-2px jitter
      pts.push(e.p);
      ed.penPreview = { nodes: pts.map((p) => node(p.x, p.y)), closed: false, cursor: null };
    },
    up(ed, e) {
      if (pts.length) pts.push(e.p);
      const tol = ed.toolOptions.pencilTolerance / ed.viewport.zoom;
      const nodes = fitCurve(pts, tol);
      ed.penPreview = null;
      pts = [];
      if (nodes.length < 2) return;
      const el = createPath(nodes, false, { name: 'Pencil path', ...strokeOnly(ed) });
      ed.apply('Draw with pencil', (d) => addElement(d, el, ed.activeLayerId));
      ed.select([el.id]);
    },
    cancel(ed) { pts = []; ed.penPreview = null; },
  };
}

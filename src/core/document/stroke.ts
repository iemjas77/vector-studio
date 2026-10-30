import paperCore from 'paper/dist/paper-core.js';
import type PaperTypes from 'paper';
import { flattenPath } from '../geometry/path';
import type { PathNode, Vec } from '../geometry/types';
import { createGroup, createPath } from './factory';
import { locate } from './query';
import { elementSubpaths } from './shape';
import type { Element, LineCap, LineJoin, PathElement, ShapeElement, Stroke, Subpath, VDocument } from './types';

const paper = paperCore as unknown as typeof PaperTypes;
let scope: InstanceType<typeof PaperTypes.PaperScope> | null = null;
const ps = () => { if (!scope) { scope = new paper.PaperScope(); scope.setup(new paper.Size(1, 1)); } return scope; };

type Pt = Vec;
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const norm = (a: Pt): Pt => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };

function poly(points: Pt[]): paper.Path {
  const p = new paper.Path({ segments: points.map((q) => [q.x, q.y]), closed: true, insert: false });
  if (p.area < 0) p.reverse(); // consistent orientation so the non-zero union merges instead of cancelling
  return p;
}
function circle(c: Pt, r: number): paper.Path {
  const p = new paper.Path.Circle({ center: [c.x, c.y], radius: r, insert: false });
  if (p.area < 0) p.reverse();
  return p;
}

/** Splits a polyline (optionally closed) into dashes. Returns open polylines, or the original when there is no dash pattern. */
function applyDash(pts: Pt[], closed: boolean, dash: number[]): { pts: Pt[]; closed: boolean }[] {
  const pattern = dash.length % 2 ? [...dash, ...dash] : dash;
  if (!pattern.length || pattern.every((d) => d <= 0)) return [{ pts, closed }];
  const path = closed ? [...pts, pts[0]] : pts;
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let cur: Pt[] = [];
  let idx = 0, remain = pattern[0], on = true;
  cur.push(path[0]);
  for (let i = 1; i < path.length; i++) {
    let a = path[i - 1];
    const b = path[i];
    let segLen = len(sub(b, a));
    while (segLen > remain) {
      const t = remain / segLen;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (on) { cur.push(p); out.push({ pts: cur, closed: false }); cur = []; } else cur = [p];
      on = !on; idx = (idx + 1) % pattern.length; remain = pattern[idx] || 1e-6;
      segLen -= len(sub(p, a)); a = p;
    }
    remain -= segLen;
    if (on) cur.push(b);
  }
  if (on && cur.length > 1) out.push({ pts: cur, closed: false });
  return out;
}

/** The region covered by stroking `subs` with the given width/cap/join, as a Paper path item (world = element-local space). */
function strokeRegion(subs: Subpath[], width: number, cap: LineCap, join: LineJoin, miterLimit: number, dash: number[]): paper.PathItem | null {
  ps();
  const hw = width / 2;
  const pieces: paper.Path[] = [];
  for (const sp of subs) {
    if (sp.nodes.length < 2) continue;
    const base = flattenPath(sp.nodes, sp.closed, 0.05);
    const clean: Pt[] = base.filter((p, i) => i === 0 || len(sub(p, base[i - 1])) > 1e-9);
    if (sp.closed && clean.length > 1 && len(sub(clean[0], clean[clean.length - 1])) < 1e-9) clean.pop();
    for (const run of applyDash(clean, sp.closed, dash)) {
      const pts = run.pts;
      if (pts.length < 2) continue;
      const n = run.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const d = norm(sub(b, a));
        const nx = -d.y * hw, ny = d.x * hw;
        let a2 = a, b2 = b;
        if (!run.closed && cap === 'square') {
          if (i === 0) a2 = { x: a.x - d.x * hw, y: a.y - d.y * hw };
          if (i === n - 1) b2 = { x: b.x + d.x * hw, y: b.y + d.y * hw };
        }
        pieces.push(poly([{ x: a2.x + nx, y: a2.y + ny }, { x: b2.x + nx, y: b2.y + ny }, { x: b2.x - nx, y: b2.y - ny }, { x: a2.x - nx, y: a2.y - ny }]));
      }
      if (!run.closed && cap === 'round') { pieces.push(circle(pts[0], hw)); pieces.push(circle(pts[pts.length - 1], hw)); }
      // joins at interior vertices (and at the start/end of closed runs)
      const joinAt = (i: number) => {
        const p = pts[i], prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
        const d1 = norm(sub(p, prev)), d2 = norm(sub(next, p));
        const cross = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(cross) < 1e-9 && d1.x * d2.x + d1.y * d2.y > 0) return; // straight
        if (join === 'round') { pieces.push(circle(p, hw)); return; }
        for (const s of [1, -1]) {
          const n1 = { x: -d1.y * hw * s, y: d1.x * hw * s }, n2 = { x: -d2.y * hw * s, y: d2.x * hw * s };
          const e1 = { x: p.x + n1.x, y: p.y + n1.y }, e2 = { x: p.x + n2.x, y: p.y + n2.y };
          const wedge: Pt[] = [p, e1];
          if (join === 'miter') {
            const cosHalf = Math.sqrt(Math.max(0, (1 + (d1.x * d2.x + d1.y * d2.y)) / 2)); // cos of half the turning angle
            const ratio = cosHalf > 1e-9 ? 1 / cosHalf : Infinity; // miter length / stroke width
            if (ratio <= miterLimit) {
              const bis = norm({ x: n1.x + n2.x, y: n1.y + n2.y });
              wedge.push({ x: p.x + bis.x * hw * ratio, y: p.y + bis.y * hw * ratio });
            }
          }
          wedge.push(e2);
          pieces.push(poly(wedge));
        }
      };
      if (run.closed) for (let i = 0; i < pts.length; i++) joinAt(i);
      else for (let i = 1; i < pts.length - 1; i++) joinAt(i);
    }
  }
  if (pieces.length === 0) return null;
  const compound = new paper.CompoundPath({ children: pieces, fillRule: 'nonzero', insert: false });
  return compound.unite(new paper.Path({ insert: false }), { insert: false }) ?? compound;
}

function toSubpaths(item: paper.PathItem): Subpath[] {
  const paths: paper.Path[] = item instanceof paper.CompoundPath ? (item.children as paper.Path[]) : [item as paper.Path];
  return paths.filter((p) => p.segments.length >= 2).map((p) => ({
    closed: true,
    nodes: p.segments.map((s): PathNode => ({ x: s.point.x, y: s.point.y, inX: s.handleIn.x, inY: s.handleIn.y, outX: s.handleOut.x, outY: s.handleOut.y })),
  }));
}

function asPathElement(subs: Subpath[], init: Partial<PathElement>): PathElement | null {
  if (subs.length === 0) return null;
  return createPath(subs[0].nodes, true, { extra: subs.slice(1), fillRule: 'nonzero', ...init });
}

/**
 * Expand Stroke: replaces a shape that has a stroke by a group of outlines — its fill (if any) and the stroke as a filled shape
 * (stroke becomes fill). Curves in the stroke outline are polygonal approximations (flatness 0.05 units).
 * Returns the new element id, or null if the shape has no stroke.
 */
export function expandStroke(doc: VDocument, id: string): string | null {
  const loc = locate(doc, id);
  if (!loc || loc.element.type === 'group') return null;
  const el = loc.element as ShapeElement;
  const st: Stroke | null = el.stroke && el.stroke.width > 0 ? el.stroke : null;
  if (!st) return null;
  const region = strokeRegion(elementSubpaths(el), st.width, st.cap, st.join, st.miterLimit, st.dash);
  const strokeEl = region ? asPathElement(toSubpaths(region), { name: `${el.name} stroke`, fill: st.paint, stroke: null, opacity: 1 }) : null;
  if (!strokeEl) return null;
  const parts: Element[] = [];
  if (el.fill) {
    const f = { ...el, stroke: null, name: `${el.name} fill`, opacity: 1, transform: [1, 0, 0, 1, 0, 0] as typeof el.transform } as Element;
    parts.push({ ...f, id: `${el.id}-fill` } as Element);
  }
  parts.push(strokeEl);
  const g = createGroup(parts, { name: `${el.name} (expanded)`, transform: [...el.transform] as typeof el.transform, opacity: el.opacity });
  loc.siblings.splice(loc.index, 1, g);
  return g.id;
}

/**
 * Offset Path for closed shapes: grows (distance > 0) or shrinks (< 0) the fill outline by |distance|.
 * Returns the id of a new path placed above the original (which is kept), or null if nothing remains.
 */
export function offsetPath(doc: VDocument, id: string, distance: number, join: LineJoin = 'round', miterLimit = 4): string | null {
  const loc = locate(doc, id);
  if (!loc || loc.element.type === 'group' || distance === 0) return null;
  const el = loc.element as ShapeElement;
  const subs = elementSubpaths(el).filter((s) => s.nodes.length >= 3);
  if (subs.length === 0) return null;
  ps();
  const shape = new paper.CompoundPath({ children: subs.map((s) => new paper.Path({ segments: s.nodes.map((n) => new paper.Segment(new paper.Point(n.x, n.y), new paper.Point(n.inX, n.inY), new paper.Point(n.outX, n.outY))), closed: true, insert: false })), fillRule: el.type === 'path' ? el.fillRule : 'nonzero', insert: false });
  const band = strokeRegion(subs.map((s) => ({ ...s, closed: true })), Math.abs(distance) * 2, 'butt', join, miterLimit, []);
  if (!band) return null;
  const result = distance > 0 ? shape.unite(band, { insert: false }) : shape.subtract(band, { insert: false });
  const out = asPathElement(toSubpaths(result), { name: `${el.name} offset`, fill: el.fill, stroke: el.stroke, opacity: el.opacity, transform: [...el.transform] as typeof el.transform, fillRule: 'nonzero' });
  if (!out) return null;
  loc.siblings.splice(loc.index + 1, 0, out);
  return out.id;
}

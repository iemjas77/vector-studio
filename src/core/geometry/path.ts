import { cubicBounds, flattenCubic, isStraight, nearestOnCubic, splitCubic } from './bezier';
import type { Cubic, PathNode, Rect, Vec } from './types';
import { unionRect } from './matrix';

export const KAPPA = 0.5522847498307936; // 4/3*(sqrt(2)-1)

export function node(x: number, y: number, inX = 0, inY = 0, outX = 0, outY = 0): PathNode {
  return { x, y, inX, inY, outX, outY };
}

export function cloneNode(n: PathNode): PathNode {
  return { ...n };
}

/** Cubic segments of a path. For closed paths includes the closing segment. */
export function pathSegments(nodes: readonly PathNode[], closed: boolean): Cubic[] {
  const segs: Cubic[] = [];
  const count = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < count; i++) segs.push(segmentAt(nodes, i, closed));
  return segs;
}

export function segmentAt(nodes: readonly PathNode[], i: number, closed: boolean): Cubic {
  const a = nodes[i];
  const b = nodes[closed ? (i + 1) % nodes.length : i + 1];
  return {
    p0: { x: a.x, y: a.y },
    p1: { x: a.x + a.outX, y: a.y + a.outY },
    p2: { x: b.x + b.inX, y: b.y + b.inY },
    p3: { x: b.x, y: b.y },
  };
}

export function pathBounds(nodes: readonly PathNode[], closed: boolean): Rect | null {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return { x: nodes[0].x, y: nodes[0].y, w: 0, h: 0 };
  let r: Rect | null = null;
  for (const s of pathSegments(nodes, closed)) r = unionRect(r, cubicBounds(s));
  return r;
}

export function flattenPath(nodes: readonly PathNode[], closed: boolean, tolerance = 0.25): Vec[] {
  if (nodes.length === 0) return [];
  const pts: Vec[] = [{ x: nodes[0].x, y: nodes[0].y }];
  for (const s of pathSegments(nodes, closed)) flattenCubic(s, tolerance, pts);
  return pts;
}

/** Nonzero winding point-in-polygon on a flattened path. */
export function pointInPolygon(pts: readonly Vec[], p: Vec): boolean {
  let winding = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.y <= p.y) {
      if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0) winding++;
    } else if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0) winding--;
  }
  return winding !== 0;
}

export interface PathHit {
  segment: number;
  t: number;
  point: Vec;
  dist: number;
}

export function nearestOnPath(nodes: readonly PathNode[], closed: boolean, p: Vec): PathHit | null {
  let best: PathHit | null = null;
  pathSegments(nodes, closed).forEach((s, i) => {
    const r = nearestOnCubic(s, p);
    if (!best || r.dist < best.dist) best = { segment: i, t: r.t, point: r.point, dist: r.dist };
  });
  return best;
}

/** Insert a node at (segment, t) without changing the shape of the path. */
export function insertNodeAt(nodes: PathNode[], closed: boolean, segment: number, t: number): PathNode[] {
  const seg = segmentAt(nodes, segment, closed);
  const [l, r] = splitCubic(seg, t);
  const out = nodes.map(cloneNode);
  const ai = segment;
  const bi = closed ? (segment + 1) % nodes.length : segment + 1;
  out[ai].outX = l.p1.x - l.p0.x;
  out[ai].outY = l.p1.y - l.p0.y;
  out[bi].inX = r.p2.x - r.p3.x;
  out[bi].inY = r.p2.y - r.p3.y;
  const mid = node(l.p3.x, l.p3.y, l.p2.x - l.p3.x, l.p2.y - l.p3.y, r.p1.x - r.p0.x, r.p1.y - r.p0.y);
  out.splice(ai + 1, 0, mid);
  return out;
}

/**
 * Delete nodes by index. Remaining neighbours keep their handles.
 * (Illustrator-style "delete anchor" re-fits; we keep it simple and predictable.)
 */
export function deleteNodes(nodes: PathNode[], indices: ReadonlySet<number>): PathNode[] {
  return nodes.filter((_, i) => !indices.has(i)).map(cloneNode);
}

export function isSmooth(n: PathNode): boolean {
  return n.inX !== 0 || n.inY !== 0 || n.outX !== 0 || n.outY !== 0;
}

/** Corner → smooth: derive symmetric handles from neighbours. Smooth → corner: remove handles. */
export function toggleSmooth(nodes: PathNode[], closed: boolean, index: number): PathNode[] {
  const out = nodes.map(cloneNode);
  const n = out[index];
  if (isSmooth(n)) {
    n.inX = n.inY = n.outX = n.outY = 0;
    return out;
  }
  const prev = out[closed ? (index - 1 + out.length) % out.length : index - 1];
  const next = out[closed ? (index + 1) % out.length : index + 1];
  const a = prev ?? n;
  const b = next ?? n;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return out;
  const reach = (prev && next ? Math.min(Math.hypot(n.x - a.x, n.y - a.y), Math.hypot(b.x - n.x, b.y - n.y)) : len) / 3;
  dx /= len; dy /= len;
  if (prev) { n.inX = -dx * reach; n.inY = -dy * reach; }
  if (next) { n.outX = dx * reach; n.outY = dy * reach; }
  return out;
}

export function rectToNodes(x: number, y: number, w: number, h: number, rx = 0): PathNode[] {
  rx = Math.max(0, Math.min(rx, w / 2, h / 2));
  if (rx === 0) return [node(x, y), node(x + w, y), node(x + w, y + h), node(x, y + h)];
  const k = rx * KAPPA;
  // Eight nodes, clockwise from top-left tangent point.
  return [
    node(x + rx, y, -k, 0, 0, 0),
    node(x + w - rx, y, 0, 0, k, 0),
    node(x + w, y + rx, 0, -k, 0, 0),
    node(x + w, y + h - rx, 0, 0, 0, k),
    node(x + w - rx, y + h, k, 0, 0, 0),
    node(x + rx, y + h, 0, 0, -k, 0),
    node(x, y + h - rx, 0, k, 0, 0),
    node(x, y + rx, 0, 0, 0, -k),
  ];
}

export function ellipseToNodes(cx: number, cy: number, rx: number, ry: number): PathNode[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    node(cx, cy - ry, -kx, 0, kx, 0),
    node(cx + rx, cy, 0, -ky, 0, ky),
    node(cx, cy + ry, kx, 0, -kx, 0),
    node(cx - rx, cy, 0, ky, 0, -ky),
  ];
}

const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4);

/** SVG path data for nodes. */
export function nodesToSvgD(nodes: readonly PathNode[], closed: boolean): string {
  if (nodes.length === 0) return '';
  let d = `M${fmt(nodes[0].x)} ${fmt(nodes[0].y)}`;
  for (const s of pathSegments(nodes, closed)) {
    d += isStraight(s)
      ? `L${fmt(s.p3.x)} ${fmt(s.p3.y)}`
      : `C${fmt(s.p1.x)} ${fmt(s.p1.y)} ${fmt(s.p2.x)} ${fmt(s.p2.y)} ${fmt(s.p3.x)} ${fmt(s.p3.y)}`;
  }
  return closed ? d + 'Z' : d;
}

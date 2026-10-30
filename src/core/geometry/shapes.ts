import { KAPPA, node } from './path';
import type { PathNode, Vec } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

/** Regular polygon. The first vertex is at `rotation` (radians, 0 = pointing right). */
export function regularPolygon(cx: number, cy: number, r: number, sides: number, rotation = -Math.PI / 2): PathNode[] {
  const n = Math.max(3, Math.round(sides));
  return Array.from({ length: n }, (_, i) => { const a = rotation + (i * 2 * Math.PI) / n; return node(cx + Math.cos(a) * r, cy + Math.sin(a) * r); });
}

/** Star with `points` tips; inner vertices sit at `innerRatio` × outer radius. */
export function star(cx: number, cy: number, r: number, innerRatio: number, points: number, rotation = -Math.PI / 2): PathNode[] {
  const n = Math.max(3, Math.round(points));
  const out: PathNode[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rotation + (i * Math.PI) / n;
    const rr = i % 2 === 0 ? r : r * Math.min(0.99, Math.max(0.01, innerRatio));
    out.push(node(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
  }
  return out;
}

/** Open elliptical arc from startDeg sweeping sweepDeg (positive = clockwise on screen). Segments of ≤ 90°. */
export function arcNodes(cx: number, cy: number, rx: number, ry: number, startDeg: number, sweepDeg: number): PathNode[] {
  const sweep = Math.max(-360, Math.min(360, sweepDeg));
  if (sweep === 0) return [];
  const segs = Math.max(1, Math.ceil(Math.abs(sweep) / 90 - 1e-9));
  const d = rad(sweep) / segs;
  const t = (4 / 3) * Math.tan(d / 4);
  const pt = (a: number): Vec => ({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  const tan = (a: number): Vec => ({ x: -rx * Math.sin(a), y: ry * Math.cos(a) });
  const nodes: PathNode[] = [];
  let a = rad(startDeg);
  for (let i = 0; i <= segs; i++) {
    const p = pt(a), tg = tan(a);
    const n = node(p.x, p.y);
    if (i > 0) { n.inX = -tg.x * t; n.inY = -tg.y * t; }
    if (i < segs) { n.outX = tg.x * t; n.outY = tg.y * t; }
    nodes.push(n);
    a += d;
  }
  return nodes;
}

/** Logarithmic-style spiral from the centre out to `r` over `turns` turns; `decay` = radius ratio per turn (0.5–0.95). */
export function spiralNodes(cx: number, cy: number, r: number, turns: number, decay = 0.8, rotation = 0): PathNode[] {
  const total = Math.max(0.25, turns) * 2 * Math.PI;
  const k = Math.log(Math.min(0.99, Math.max(0.3, decay))) / (2 * Math.PI);       // r(θ) = r·e^{k(total-θ)}
  const rAt = (th: number) => r * Math.exp(k * (total - th));
  const steps = Math.max(2, Math.ceil(total / (Math.PI / 4)));
  const nodes: PathNode[] = [];
  for (let i = 0; i <= steps; i++) {
    const th = (total * i) / steps, rr = rAt(th), a = rotation + th;
    const dr = k * rr;                                                              // dr/dθ
    const tx = dr * Math.cos(a) - rr * Math.sin(a), ty = dr * Math.sin(a) + rr * Math.cos(a);
    const h = total / steps / 3;
    const n = node(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    if (i > 0) { n.inX = -tx * h; n.inY = -ty * h; }
    if (i < steps) { n.outX = tx * h; n.outY = ty * h; }
    nodes.push(n);
  }
  return nodes;
}

export { KAPPA };

// ---- Schneider curve fitting (Graphics Gems) for the Pencil tool ----
type V = Vec;
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
const len = (a: V) => Math.hypot(a.x, a.y);
const unit = (a: V): V => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
type Bez = [V, V, V, V];

const bez = (b: Bez, t: number): V => {
  const u = 1 - t;
  return { x: u * u * u * b[0].x + 3 * u * u * t * b[1].x + 3 * u * t * t * b[2].x + t * t * t * b[3].x, y: u * u * u * b[0].y + 3 * u * u * t * b[1].y + 3 * u * t * t * b[2].y + t * t * t * b[3].y };
};
const bezD1 = (b: Bez, t: number): V => { const u = 1 - t; return add(add(mul(sub(b[1], b[0]), 3 * u * u), mul(sub(b[2], b[1]), 6 * u * t)), mul(sub(b[3], b[2]), 3 * t * t)); };
const bezD2 = (b: Bez, t: number): V => add(mul(add(sub(b[2], mul(b[1], 2)), b[0]), 6 * (1 - t)), mul(add(sub(b[3], mul(b[2], 2)), b[1]), 6 * t));

function chordParams(pts: V[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + len(sub(pts[i], pts[i - 1])));
  return u.map((x) => x / u[u.length - 1]);
}

function generate(pts: V[], u: number[], t1: V, t2: V): Bez {
  const p0 = pts[0], p3 = pts[pts.length - 1];
  const A = u.map((t) => [mul(t1, 3 * (1 - t) * (1 - t) * t), mul(t2, 3 * (1 - t) * t * t)]);
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i], b0 = (1 - t) ** 3, b1 = 3 * t * (1 - t) ** 2, b2 = 3 * t * t * (1 - t), b3 = t ** 3;
    c00 += dot(A[i][0], A[i][0]); c01 += dot(A[i][0], A[i][1]); c11 += dot(A[i][1], A[i][1]);
    const tmp = sub(pts[i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(A[i][0], tmp); x1 += dot(A[i][1], tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const seg = len(sub(p3, p0));
  let a1 = det !== 0 ? (x0 * c11 - x1 * c01) / det : 0, a2 = det !== 0 ? (c00 * x1 - c01 * x0) / det : 0;
  const eps = 1e-6 * seg;
  if (a1 < eps || a2 < eps) { a1 = a2 = seg / 3; }
  return [p0, add(p0, mul(t1, a1)), add(p3, mul(t2, a2)), p3];
}

function reparam(b: Bez, pts: V[], u: number[]): number[] {
  return u.map((t, i) => {
    const d = sub(bez(b, t), pts[i]), d1 = bezD1(b, t), d2 = bezD2(b, t);
    const den = dot(d1, d1) + dot(d, d2);
    return den === 0 ? t : Math.min(1, Math.max(0, t - dot(d, d1) / den));
  });
}

function maxErr(b: Bez, pts: V[], u: number[]): { err: number; at: number } {
  let err = 0, at = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len(sub(bez(b, u[i]), pts[i]));
    if (d >= err) { err = d; at = i; }
  }
  return { err, at };
}

function fit(pts: V[], t1: V, t2: V, maxError: number, out: Bez[]): void {
  if (pts.length === 2) {
    const d = len(sub(pts[1], pts[0])) / 3;
    out.push([pts[0], add(pts[0], mul(t1, d)), add(pts[1], mul(t2, d)), pts[1]]);
    return;
  }
  let u = chordParams(pts);
  let b = generate(pts, u, t1, t2);
  let { err, at } = maxErr(b, pts, u);
  if (err < maxError) { out.push(b); return; }
  if (err < maxError * 4) {
    for (let i = 0; i < 20; i++) {
      u = reparam(b, pts, u);
      b = generate(pts, u, t1, t2);
      ({ err, at } = maxErr(b, pts, u));
      if (err < maxError) { out.push(b); return; }
    }
  }
  const center = unit(sub(pts[at - 1], pts[at + 1]));
  fit(pts.slice(0, at + 1), t1, center, maxError, out);
  fit(pts.slice(at), mul(center, -1), t2, maxError, out);
}

/** Fit a smooth cubic Bezier path through freehand points (max deviation `maxError`). Returns nodes of an open path. */
export function fitCurve(points: Vec[], maxError = 2): PathNode[] {
  const pts = points.filter((p, i) => i === 0 || len(sub(p, points[i - 1])) > 1e-9);
  if (pts.length === 0) return [];
  if (pts.length === 1) return [node(pts[0].x, pts[0].y)];
  const out: Bez[] = [];
  const n = pts.length;
  const t1 = unit(sub(pts[Math.min(2, n - 1)], pts[0])), t2 = unit(sub(pts[Math.max(0, n - 3)], pts[n - 1]));
  fit(pts, t1, t2, Math.max(0.01, maxError), out);
  const nodes: PathNode[] = [node(out[0][0].x, out[0][0].y)];
  out.forEach((b, i) => {
    nodes[i].outX = b[1].x - b[0].x; nodes[i].outY = b[1].y - b[0].y;
    nodes.push(node(b[3].x, b[3].y, b[2].x - b[3].x, b[2].y - b[3].y));
  });
  return nodes;
}

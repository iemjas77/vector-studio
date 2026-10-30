import type { Cubic, Rect, Vec } from './types';

export function cubicPoint(c: Cubic, t: number): Vec {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return {
    x: w0 * c.p0.x + w1 * c.p1.x + w2 * c.p2.x + w3 * c.p3.x,
    y: w0 * c.p0.y + w1 * c.p1.y + w2 * c.p2.y + w3 * c.p3.y,
  };
}

const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** de Casteljau split. Both halves together trace exactly the original curve. */
export function splitCubic(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = lerp(c.p0, c.p1, t);
  const p12 = lerp(c.p1, c.p2, t);
  const p23 = lerp(c.p2, c.p3, t);
  const a = lerp(p01, p12, t);
  const b = lerp(p12, p23, t);
  const m = lerp(a, b, t);
  return [
    { p0: c.p0, p1: p01, p2: a, p3: m },
    { p0: m, p1: b, p2: p23, p3: c.p3 },
  ];
}

/** Real roots in (0,1) of the derivative along one axis. */
function derivativeRoots(a: number, b: number, c: number, d: number): number[] {
  // B'(t) ∝ 3[(b-a)(1-t)^2 + 2(c-b)(1-t)t + (d-c)t^2] → qa t^2 + qb t + qc
  const qa = -a + 3 * b - 3 * c + d;
  const qb = 2 * (a - 2 * b + c);
  const qc = b - a;
  const roots: number[] = [];
  if (Math.abs(qa) < 1e-12) {
    if (Math.abs(qb) > 1e-12) roots.push(-qc / qb);
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      roots.push((-qb + s) / (2 * qa), (-qb - s) / (2 * qa));
    }
  }
  return roots.filter((t) => t > 1e-9 && t < 1 - 1e-9);
}

/** Exact tight bounds of a cubic. */
export function cubicBounds(c: Cubic): Rect {
  const ts = [0, 1, ...derivativeRoots(c.p0.x, c.p1.x, c.p2.x, c.p3.x), ...derivativeRoots(c.p0.y, c.p1.y, c.p2.y, c.p3.y)];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of ts) {
    const p = cubicPoint(c, t);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function isStraight(c: Cubic): boolean {
  return c.p0.x === c.p1.x && c.p0.y === c.p1.y && c.p3.x === c.p2.x && c.p3.y === c.p2.y;
}

/** Flatness: max distance of control points from the chord. */
function flatness(c: Cubic): number {
  const dx = c.p3.x - c.p0.x;
  const dy = c.p3.y - c.p0.y;
  const len = Math.hypot(dx, dy);
  const dist = (p: Vec) =>
    len < 1e-12 ? Math.hypot(p.x - c.p0.x, p.y - c.p0.y) : Math.abs((p.x - c.p0.x) * dy - (p.y - c.p0.y) * dx) / len;
  return Math.max(dist(c.p1), dist(c.p2));
}

/** Adaptive flattening; appends points after the start point (start not included). */
export function flattenCubic(c: Cubic, tolerance: number, out: Vec[], depth = 0): void {
  if (depth > 16 || flatness(c) <= tolerance) {
    out.push(c.p3);
    return;
  }
  const [a, b] = splitCubic(c, 0.5);
  flattenCubic(a, tolerance, out, depth + 1);
  flattenCubic(b, tolerance, out, depth + 1);
}

/** Nearest point on a cubic: coarse sampling then ternary-style refinement. */
export function nearestOnCubic(c: Cubic, p: Vec): { t: number; point: Vec; dist: number } {
  const N = 32;
  let bestT = 0, bestD = Infinity;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const q = cubicPoint(c, t);
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) { bestD = d; bestT = t; }
  }
  let lo = Math.max(0, bestT - 1 / N), hi = Math.min(1, bestT + 1 / N);
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const q1 = cubicPoint(c, m1), q2 = cubicPoint(c, m2);
    const d1 = (q1.x - p.x) ** 2 + (q1.y - p.y) ** 2;
    const d2 = (q2.x - p.x) ** 2 + (q2.y - p.y) ** 2;
    if (d1 < d2) hi = m2; else lo = m1;
  }
  const t = (lo + hi) / 2;
  const point = cubicPoint(c, t);
  return { t, point, dist: Math.hypot(point.x - p.x, point.y - p.y) };
}

export function cubicLength(c: Cubic, tolerance = 0.01): number {
  const pts: Vec[] = [c.p0];
  flattenCubic(c, tolerance, pts);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

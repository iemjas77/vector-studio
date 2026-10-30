import type { Matrix, Rect, Vec } from './types';

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Returns m1 · m2 (apply m2 first, then m1). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function invert(m: Matrix): Matrix | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function apply(m: Matrix, p: Vec): Vec {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Transforms a direction vector (ignores translation). */
export function applyVector(m: Matrix, p: Vec): Vec {
  return { x: m[0] * p.x + m[2] * p.y, y: m[1] * p.x + m[3] * p.y };
}

export const translate = (tx: number, ty: number): Matrix => [1, 0, 0, 1, tx, ty];
export const scale = (sx: number, sy: number = sx): Matrix => [sx, 0, 0, sy, 0, 0];
export function rotate(rad: number): Matrix {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}

/** Matrix that applies `m` about the pivot point. */
export function aboutPoint(m: Matrix, pivot: Vec): Matrix {
  return multiply(translate(pivot.x, pivot.y), multiply(m, translate(-pivot.x, -pivot.y)));
}

export function isIdentity(m: Matrix): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

/** Axis-aligned bounds of a rect after transform. */
export function transformRect(m: Matrix, r: Rect): Rect {
  const pts = [
    apply(m, { x: r.x, y: r.y }),
    apply(m, { x: r.x + r.w, y: r.y }),
    apply(m, { x: r.x + r.w, y: r.y + r.h }),
    apply(m, { x: r.x, y: r.y + r.h }),
  ];
  return boundsOfPoints(pts);
}

export function boundsOfPoints(pts: Vec[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function rectContainsPoint(r: Rect, p: Vec, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

export function matrixEquals(a: Matrix, b: Matrix, eps = 1e-9): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= eps);
}

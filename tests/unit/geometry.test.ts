import { describe, expect, it } from 'vitest';
import { cubicBounds, cubicPoint, flattenCubic, nearestOnCubic, splitCubic } from '../../src/core/geometry/bezier';
import { apply, invert, multiply, rotate, scale, translate, aboutPoint } from '../../src/core/geometry/matrix';
import {
  deleteNodes, ellipseToNodes, flattenPath, insertNodeAt, nearestOnPath, node, nodesToSvgD, pathBounds,
  pathSegments, pointInPolygon, rectToNodes, toggleSmooth,
} from '../../src/core/geometry/path';
import type { Cubic } from '../../src/core/geometry/types';

const S: Cubic = { p0: { x: 0, y: 0 }, p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, p3: { x: 100, y: 0 } };

describe('matrix', () => {
  it('multiplies in apply-right-first order and inverts', () => {
    const m = multiply(translate(10, 20), scale(2));
    expect(apply(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 22 });
    const inv = invert(m)!;
    const p = apply(inv, apply(m, { x: 7, y: -3 }));
    expect(p.x).toBeCloseTo(7); expect(p.y).toBeCloseTo(-3);
  });
  it('returns null for singular matrices', () => {
    expect(invert([0, 0, 0, 0, 5, 5])).toBeNull();
  });
  it('rotates about a pivot', () => {
    const m = aboutPoint(rotate(Math.PI / 2), { x: 10, y: 10 });
    const p = apply(m, { x: 20, y: 10 });
    expect(p.x).toBeCloseTo(10); expect(p.y).toBeCloseTo(20);
  });
});

describe('bezier', () => {
  it('exact bounds find the curve extremum, not the control polygon', () => {
    const b = cubicBounds(S);
    expect(b.x).toBeCloseTo(0); expect(b.w).toBeCloseTo(100);
    expect(b.y).toBeCloseTo(0);
    expect(b.h).toBeCloseTo(75); // max y of this curve is 0.75*100
  });
  it('bounds of a loop curve with inflection stay tight', () => {
    const c: Cubic = { p0: { x: 0, y: 0 }, p1: { x: 200, y: 100 }, p2: { x: -100, y: 100 }, p3: { x: 100, y: 0 } };
    const b = cubicBounds(c);
    for (let i = 0; i <= 200; i++) {
      const p = cubicPoint(c, i / 200);
      expect(p.x).toBeGreaterThanOrEqual(b.x - 1e-6); expect(p.x).toBeLessThanOrEqual(b.x + b.w + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(b.y - 1e-6); expect(p.y).toBeLessThanOrEqual(b.y + b.h + 1e-6);
    }
  });
  it('split halves reproduce the original curve', () => {
    const [l, r] = splitCubic(S, 0.3);
    for (const t of [0, 0.25, 0.5, 1]) {
      const a = cubicPoint(l, t), o = cubicPoint(S, 0.3 * t);
      expect(a.x).toBeCloseTo(o.x); expect(a.y).toBeCloseTo(o.y);
      const b = cubicPoint(r, t), o2 = cubicPoint(S, 0.3 + 0.7 * t);
      expect(b.x).toBeCloseTo(o2.x); expect(b.y).toBeCloseTo(o2.y);
    }
  });
  it('flattening stays within tolerance of the true curve', () => {
    const pts = [S.p0];
    flattenCubic(S, 0.1, pts);
    expect(pts.length).toBeGreaterThan(4);
    for (let i = 0; i <= 100; i++) {
      const q = cubicPoint(S, i / 100);
      const d = Math.min(...pts.slice(1).map((p, k) => distToSeg(q, pts[k], p)));
      expect(d).toBeLessThan(0.11);
    }
  });
  it('degenerate (zero-length) curves do not blow up', () => {
    const z: Cubic = { p0: { x: 5, y: 5 }, p1: { x: 5, y: 5 }, p2: { x: 5, y: 5 }, p3: { x: 5, y: 5 } };
    const pts = [z.p0]; flattenCubic(z, 0.1, pts);
    expect(pts.length).toBe(2);
    expect(cubicBounds(z)).toEqual({ x: 5, y: 5, w: 0, h: 0 });
    expect(nearestOnCubic(z, { x: 8, y: 9 }).dist).toBeCloseTo(5);
  });
  it('nearest point on curve is accurate to 1e-3', () => {
    const q = cubicPoint(S, 0.37);
    const r = nearestOnCubic(S, { x: q.x + 0, y: q.y });
    expect(r.t).toBeCloseTo(0.37, 3);
  });
});

function distToSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

describe('path', () => {
  it('ellipse nodes approximate a circle within 0.03%', () => {
    const nodes = ellipseToNodes(0, 0, 100, 100);
    for (const s of pathSegments(nodes, true)) {
      for (let i = 0; i <= 20; i++) {
        const p = cubicPoint(s, i / 20);
        expect(Math.abs(Math.hypot(p.x, p.y) - 100)).toBeLessThan(0.03);
      }
    }
    const b = pathBounds(nodes, true)!;
    expect(b).toMatchObject({ x: -100, y: -100, w: 200, h: 200 });
  });
  it('rounded rect has eight nodes and the right bounds', () => {
    const n = rectToNodes(10, 20, 100, 50, 10);
    expect(n).toHaveLength(8);
    expect(pathBounds(n, true)).toMatchObject({ x: 10, y: 20, w: 100, h: 50 });
    expect(rectToNodes(0, 0, 10, 10, 99)).toHaveLength(8); // radius clamps
  });
  it('insertNodeAt preserves the shape exactly', () => {
    const nodes = [node(0, 0, 0, 0, 0, 100), node(100, 0, 0, 100, 0, 0)];
    const out = insertNodeAt(nodes, false, 0, 0.4);
    expect(out).toHaveLength(3);
    const before = pathSegments(nodes, false)[0];
    const segs = pathSegments(out, false);
    const mid = cubicPoint(before, 0.4);
    expect(out[1].x).toBeCloseTo(mid.x); expect(out[1].y).toBeCloseTo(mid.y);
    const q = cubicPoint(before, 0.7);
    const r = nearestOnPath(out, false, q)!;
    expect(r.dist).toBeLessThan(1e-3);
    expect(segs).toHaveLength(2);
  });
  it('insertNodeAt on the closing segment of a closed path appends at the right index', () => {
    const tri = [node(0, 0), node(100, 0), node(50, 80)];
    const out = insertNodeAt(tri, true, 2, 0.5);
    expect(out).toHaveLength(4);
    expect(out[3]).toMatchObject({ x: 25, y: 40 });
  });
  it('deleteNodes and toggleSmooth', () => {
    const tri = [node(0, 0), node(100, 0), node(50, 80)];
    expect(deleteNodes(tri, new Set([1]))).toHaveLength(2);
    const sm = toggleSmooth(tri, true, 1);
    expect(sm[1].outX).not.toBe(0);
    expect(sm[1].inX).toBeCloseTo(-sm[1].outX);
    const back = toggleSmooth(sm, true, 1);
    expect(back[1]).toMatchObject({ inX: 0, inY: 0, outX: 0, outY: 0 });
  });
  it('point in polygon honours concave shapes', () => {
    const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }];
    expect(pointInPolygon(L, { x: 20, y: 80 })).toBe(true);
    expect(pointInPolygon(L, { x: 80, y: 80 })).toBe(false);
  });
  it('flattenPath of a closed shape returns the start then segment ends', () => {
    const pts = flattenPath(rectToNodes(0, 0, 10, 10), true);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 0, y: 0 });
  });
  it('svg path data is emitted for straight and curved segments', () => {
    expect(nodesToSvgD([node(0, 0), node(10, 0)], true)).toBe('M0 0L10 0L0 0Z');
    expect(nodesToSvgD([node(0, 0, 0, 0, 5, 0), node(10, 0, -5, 0, 0, 0)], false)).toBe('M0 0C5 0 5 0 10 0');
  });
});

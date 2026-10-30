import { describe, expect, it } from 'vitest';
import { arcNodes, fitCurve, regularPolygon, spiralNodes, star } from '../../src/core/geometry/shapes';
import { pathBounds, pathSegments } from '../../src/core/geometry/path';
import { cubicPoint } from '../../src/core/geometry/bezier';
import type { Vec } from '../../src/core/geometry/types';

describe('shape generators', () => {
  it('regular polygons have equal radii and equal side lengths', () => {
    for (const n of [3, 5, 6, 12]) {
      const p = regularPolygon(100, 100, 50, n);
      expect(p).toHaveLength(n);
      p.forEach((v) => expect(Math.hypot(v.x - 100, v.y - 100)).toBeCloseTo(50));
      const side = (i: number) => Math.hypot(p[(i + 1) % n].x - p[i].x, p[(i + 1) % n].y - p[i].y);
      for (let i = 1; i < n; i++) expect(side(i)).toBeCloseTo(side(0));
    }
    expect(regularPolygon(0, 0, 10, 2)).toHaveLength(3);          // minimum 3 sides
    expect(regularPolygon(0, 0, 10, 4, 0)[0]).toMatchObject({ x: 10, y: 0 });
  });
  it('stars alternate outer/inner radius', () => {
    const s = star(0, 0, 100, 0.4, 5);
    expect(s).toHaveLength(10);
    s.forEach((v, i) => expect(Math.hypot(v.x, v.y)).toBeCloseTo(i % 2 ? 40 : 100));
    expect(star(0, 0, 10, 5, 5)[1]).not.toMatchObject({ x: 0, y: 0 });   // ratio is clamped
  });
  it('arcs: start/end points, sweep, and radial accuracy', () => {
    const a = arcNodes(0, 0, 100, 100, 0, 270);
    expect(a).toHaveLength(4);
    expect(a[0]).toMatchObject({ x: 100, y: 0 });
    expect(a[3].x).toBeCloseTo(0); expect(a[3].y).toBeCloseTo(-100);       // 270° clockwise on screen ends at the top
    for (const s of pathSegments(a, false)) for (let t = 0; t <= 1; t += 0.1) { const p = cubicPoint(s, t); expect(Math.abs(Math.hypot(p.x, p.y) - 100)).toBeLessThan(0.05); }
    expect(arcNodes(0, 0, 5, 5, 0, 0)).toEqual([]);
    expect(arcNodes(0, 0, 5, 5, 0, -90)).toHaveLength(2);
    expect(pathBounds(arcNodes(50, 50, 30, 10, 0, 360), false)).toMatchObject({ w: expect.closeTo(60, 1), h: expect.closeTo(20, 1) });
  });
  it('spirals wind outwards to the requested radius', () => {
    const s = spiralNodes(0, 0, 100, 3, 0.8);
    const radii = s.map((n) => Math.hypot(n.x, n.y));
    expect(radii[0]).toBeLessThan(radii[radii.length - 1]);
    expect(radii[radii.length - 1]).toBeCloseTo(100);
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    const mid = cubicPoint(pathSegments(s, false)[5], 0.5);
    expect(Math.hypot(mid.x, mid.y)).toBeGreaterThan(radii[5] - 1);
  });
});

describe('curve fitting (Pencil)', () => {
  const sample = (f: (t: number) => Vec, n: number) => Array.from({ length: n }, (_, i) => f(i / (n - 1)));
  const maxDev = (pts: Vec[], nodes: ReturnType<typeof fitCurve>) => {
    const dense: Vec[] = [];
    for (const s of pathSegments(nodes, false)) for (let t = 0; t <= 1; t += 0.002) dense.push(cubicPoint(s, t));
    return Math.max(...pts.map((p) => Math.min(...dense.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))));
  };
  it('fits a noisy arc with few nodes within tolerance', () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    const pts = sample((t) => ({ x: 100 + 80 * Math.cos(t * Math.PI), y: 100 + 80 * Math.sin(t * Math.PI) }), 120).map((p) => ({ x: p.x + rnd() * 0.6, y: p.y + rnd() * 0.6 }));
    const nodes = fitCurve(pts, 2);
    expect(nodes.length).toBeLessThanOrEqual(8);
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(maxDev(pts, nodes)).toBeLessThan(2.5);
    expect(nodes[0]).toMatchObject({ x: pts[0].x, y: pts[0].y });
    expect(nodes[nodes.length - 1].x).toBeCloseTo(pts[pts.length - 1].x);
  });
  it('straight strokes collapse to one segment; corners are preserved; degenerate inputs are safe', () => {
    expect(fitCurve(sample((t) => ({ x: t * 100, y: t * 50 }), 40), 1)).toHaveLength(2);
    const corner = [...sample((t) => ({ x: t * 100, y: 0 }), 30), ...sample((t) => ({ x: 100, y: t * 100 }), 30).slice(1)];
    const n = fitCurve(corner, 1);
    expect(n.length).toBeGreaterThanOrEqual(3);
    expect(n.some((v) => Math.abs(v.x - 100) < 6 && Math.abs(v.y) < 6)).toBe(true);
    expect(fitCurve([], 1)).toEqual([]);
    expect(fitCurve([{ x: 1, y: 2 }], 1)).toHaveLength(1);
    expect(fitCurve([{ x: 1, y: 2 }, { x: 1, y: 2 }], 1)).toHaveLength(1);
    expect(fitCurve([{ x: 0, y: 0 }, { x: 10, y: 0 }], 1)).toHaveLength(2);
  });
});

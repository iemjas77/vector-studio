import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  addElement, createDocument, createEllipse, createPath, createRect, defaultStroke, expandStroke, getElement, History, offsetPath, setIdGenerator, solid,
  worldBounds, type Element, type VDocument,
} from '../../src/core/document';
import { node } from '../../src/core/geometry/path';
import { rasterizeArtboard } from '../../src/render/export';

beforeEach(() => { let i = 0; setIdGenerator(() => 's' + ++i); });
const make = (w: number, h: number) => { const canvas = createCanvas(w, h); return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D }; };
function pixels(doc: VDocument): Uint8ClampedArray {
  const off = rasterizeArtboard(doc, doc.artboards[0], make, { transparent: true });
  return (off.ctx as unknown as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }).getImageData(0, 0, 300, 300).data;
}
const area = (doc: VDocument) => { const d = pixels(doc); let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n; };
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => { let bad = 0; for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 128) bad++; return bad; };
const doc300 = () => createDocument('d', 300, 300);

function expandedLine(opts: Partial<ReturnType<typeof defaultStroke>>) {
  const doc = doc300();
  const p = createPath([node(50, 150), node(150, 150)], false, { fill: null, stroke: { ...defaultStroke('#000000', 10), ...opts } });
  addElement(doc, p);
  const before = pixels(doc);
  const id = expandStroke(doc, p.id)!;
  return { doc, id, before };
}

describe('expand stroke', () => {
  it('butt, square and round caps give the exact areas and look identical to the live stroke', () => {
    const butt = expandedLine({ cap: 'butt' });
    expect(Math.abs(area(butt.doc) - 1000)).toBeLessThan(25);
    expect(same(pixels(butt.doc), butt.before)).toBeLessThan(40);
    const sq = expandedLine({ cap: 'square' });
    expect(Math.abs(area(sq.doc) - 1100)).toBeLessThan(25);
    expect(same(pixels(sq.doc), sq.before)).toBeLessThan(40);
    const round = expandedLine({ cap: 'round' });
    expect(Math.abs(area(round.doc) - (1000 + Math.PI * 25))).toBeLessThan(30);
    expect(same(pixels(round.doc), round.before)).toBeLessThan(60);
  });
  it('the stroke becomes a filled shape with the stroke colour; no stroke remains; result is editable geometry', () => {
    const { doc, id } = expandedLine({ paint: solid('#ff0000', 0.5) });
    const g = getElement(doc, id)!;
    expect(g.type).toBe('group');
    const shape = (g as Extract<Element, { type: 'group' }>).children[0];
    expect(shape).toMatchObject({ type: 'path', stroke: null, fill: { color: '#ff0000', alpha: 0.5 } });
    expect(worldBounds(doc, id)).toMatchObject({ x: 50, y: 145, w: 100, h: 10 });
  });
  it('closed rectangle: miter, round and bevel joins have the analytic areas', () => {
    const rect = (join: 'miter' | 'round' | 'bevel') => {
      const doc = doc300();
      const r = createRect(100, 100, 100, 100, { fill: null, stroke: { ...defaultStroke('#000', 10), join } });
      addElement(doc, r);
      const before = pixels(doc);
      expandStroke(doc, r.id);
      return { a: area(doc), diff: same(pixels(doc), before) };
    };
    const m = rect('miter'), r = rect('round'), b = rect('bevel');
    expect(Math.abs(m.a - 4000)).toBeLessThan(60);
    expect(Math.abs(r.a - (4000 - 4 * 25 * (1 - Math.PI / 4)))).toBeLessThan(60);
    expect(Math.abs(b.a - 3950)).toBeLessThan(60);
    [m, r, b].forEach((x) => expect(x.diff).toBeLessThan(120));
  });
  it('miter limit turns sharp corners into bevels', () => {
    const tri = (limit: number) => {
      const doc = doc300();
      const p = createPath([node(50, 200), node(150, 100), node(250, 200)], false, { fill: null, stroke: { ...defaultStroke('#000', 16), join: 'miter', miterLimit: limit } });
      addElement(doc, p);
      const id = expandStroke(doc, p.id)!;
      return worldBounds(doc, id)!;
    };
    expect(tri(1).y).toBeGreaterThan(tri(10).y + 3);   // long miter tip reaches higher up than the bevel
  });
  it('dashes produce separate pieces with the right ink length', () => {
    const doc = doc300();
    const p = createPath([node(0, 150), node(100, 150)], false, { fill: null, stroke: { ...defaultStroke('#000', 10), dash: [10, 10] } });
    addElement(doc, p);
    const id = expandStroke(doc, p.id)!;
    const shape = (getElement(doc, id) as Extract<Element, { type: 'group' }>).children[0];
    expect(shape.type === 'path' && shape.extra.length).toBe(4);   // 5 dashes → primary + 4 extra
    expect(Math.abs(area(doc) - 500)).toBeLessThan(20);
  });
  it('curves are followed: stroked circle ring area', () => {
    const doc = doc300();
    const c = createEllipse(150, 150, 60, 60, { fill: null, stroke: defaultStroke('#000', 12) });
    addElement(doc, c);
    expandStroke(doc, c.id);
    expect(Math.abs(area(doc) - Math.PI * (66 * 66 - 54 * 54))).toBeLessThan(80);
  });
  it('keeps the fill as its own shape, keeps transform and opacity, no stroke → nothing, undoable', () => {
    const doc = doc300();
    const r = createRect(10, 10, 50, 50, { fill: solid('#00ff00'), stroke: defaultStroke('#000', 4), transform: [2, 0, 0, 2, 5, 5], opacity: 0.5 });
    const plain = createRect(0, 0, 5, 5, { stroke: null });
    addElement(doc, r); addElement(doc, plain);
    expect(expandStroke(doc, plain.id)).toBeNull();
    const h = new History(doc);
    h.apply('Expand', (d) => { expandStroke(d, r.id); });
    const g = h.doc.layers[0].children[0];
    expect(g).toMatchObject({ type: 'group', opacity: 0.5, transform: [2, 0, 0, 2, 5, 5] });
    expect((g as Extract<Element, { type: 'group' }>).children).toHaveLength(2);
    h.undo();
    expect(h.doc.layers[0].children[0].type).toBe('rect');
  });
});

describe('offset path', () => {
  it('grows and shrinks a rectangle by the distance (round vs miter corners)', () => {
    const grow = (join: 'round' | 'miter', d: number) => {
      const doc = doc300();
      const r = createRect(100, 100, 100, 100, { stroke: null });
      addElement(doc, r);
      const id = offsetPath(doc, r.id, d, join);
      return { doc, id, orig: r.id };
    };
    const m = grow('miter', 10);
    expect(worldBounds(m.doc, m.id!)).toMatchObject({ x: 90, y: 90, w: 120, h: 120 });
    const r = grow('round', 10);
    const bb = worldBounds(r.doc, r.id!)!;
    expect(bb.w).toBeCloseTo(120, 0);
    const shrink = grow('miter', -10);
    expect(worldBounds(shrink.doc, shrink.id!)).toMatchObject({ x: 110, y: 110, w: 80, h: 80 });
    expect(getElement(shrink.doc, shrink.orig)).not.toBeNull();       // original kept
  });
  it('shrinking past nothing returns null; circles scale their radius', () => {
    const doc = doc300();
    const small = createRect(10, 10, 10, 10, { stroke: null });
    addElement(doc, small);
    expect(offsetPath(doc, small.id, -20)).toBeNull();
    const c = createEllipse(150, 150, 50, 50, { stroke: null });
    addElement(doc, c);
    const id = offsetPath(doc, c.id, -15)!;
    const b = worldBounds(doc, id)!;
    expect(b.w).toBeCloseTo(70, 0);
    expect(offsetPath(doc, c.id, 0)).toBeNull();
  });
  it('shrinking a ring (compound path) closes the hole growth correctly', () => {
    const doc = doc300();
    const ring = createPath([node(50, 50), node(250, 50), node(250, 250), node(50, 250)], true, { extra: [{ nodes: [node(100, 100), node(100, 200), node(200, 200), node(200, 100)], closed: true }], fillRule: 'evenodd', stroke: null });
    addElement(doc, ring);
    const before = area(doc);
    offsetPath(doc, ring.id, 10, 'miter');
    // original is kept below; compare only the new one by removing the original
    doc.layers[0].children.shift();
    const grown = area(doc);
    // outer 220² - inner 80² = 48400 - 6400 = 42000; original 200² - 100² = 30000
    expect(Math.abs(before - 30000)).toBeLessThan(100);
    expect(Math.abs(grown - 42000)).toBeLessThan(250);
  });
});

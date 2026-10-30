import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  addElement, booleanOperation, createDocument, createEllipse, createRect, getElement, groupElements, History, setIdGenerator, solid,
  transformWorld, worldBounds, type BooleanOp, type VDocument,
} from '../../src/core/document';
import { aboutPoint, rotate } from '../../src/core/geometry/matrix';
import { rasterizeArtboard } from '../../src/render/export';

beforeEach(() => { let i = 0; setIdGenerator(() => 'b' + ++i); });

const make = (w: number, h: number) => {
  const canvas = createCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D };
};
/** Number of opaque pixels when the document is rendered 1:1 (artboard 200×200, transparent). */
function area(doc: VDocument): number {
  const off = rasterizeArtboard(doc, doc.artboards[0], make, { transparent: true });
  const data = (off.ctx as unknown as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }).getImageData(0, 0, 200, 200).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 127) n++;
  return n;
}
function setup() {
  const doc = createDocument('d', 200, 200);
  const a = createRect(20, 20, 100, 100, { fill: solid('#ff0000'), stroke: null, name: 'A' });
  const b = createRect(70, 70, 100, 100, { fill: solid('#0000ff'), stroke: null, name: 'B' });
  addElement(doc, a); addElement(doc, b);
  return { doc, a, b };
}
const run = (op: BooleanOp) => {
  const s = setup();
  const id = booleanOperation(s.doc, [s.a.id, s.b.id], op);
  return { ...s, id };
};

describe('boolean operations (areas measured from rendered pixels)', () => {
  it('unite = 10000 + 10000 − 2500', () => {
    const { doc, id } = run('unite');
    expect(id).not.toBeNull();
    expect(Math.abs(area(doc) - 17500)).toBeLessThan(250);
    expect(doc.layers[0].children).toHaveLength(1);
  });
  it('subtract removes the front object from the back one (7500) and keeps the back style', () => {
    const { doc, id } = run('subtract');
    expect(Math.abs(area(doc) - 7500)).toBeLessThan(200);
    expect(getElement(doc, id!)).toMatchObject({ fill: { color: '#ff0000' } });
  });
  it('intersect = 2500, front style', () => {
    const { doc, id } = run('intersect');
    expect(Math.abs(area(doc) - 2500)).toBeLessThan(120);
    expect(getElement(doc, id!)).toMatchObject({ fill: { color: '#0000ff' } });
  });
  it('exclude = 15000', () => {
    const { doc } = run('exclude');
    expect(Math.abs(area(doc) - 15000)).toBeLessThan(250);
  });
  it('result bounds and compound structure are correct', () => {
    const { doc, id } = run('unite');
    expect(worldBounds(doc, id!)).toMatchObject({ x: 20, y: 20, w: 150, h: 150 });
    const ex = run('exclude');
    const el = getElement(ex.doc, ex.id!);
    expect(el?.type).toBe('path');
    if (el?.type === 'path') expect(el.extra.length).toBeGreaterThanOrEqual(1);
  });
  it('curves survive: circle minus rectangle keeps Bezier segments and exact area', () => {
    const doc = createDocument('d', 200, 200);
    const c = createEllipse(100, 100, 80, 80, { stroke: null });
    const r = createRect(100, 0, 120, 200, { stroke: null });
    addElement(doc, c); addElement(doc, r);
    const id = booleanOperation(doc, [c.id, r.id], 'subtract')!;
    const half = (Math.PI * 80 * 80) / 2;
    expect(Math.abs(area(doc) - half)).toBeLessThan(half * 0.01);
    const el = getElement(doc, id);
    if (el?.type !== 'path') throw new Error('path expected');
    expect(el.nodes.some((n) => n.outX !== 0 || n.outY !== 0)).toBe(true);
  });
  it('donut: subtracting a concentric circle creates a hole', () => {
    const doc = createDocument('d', 200, 200);
    const o = createEllipse(100, 100, 80, 80, { stroke: null }), i = createEllipse(100, 100, 40, 40, { stroke: null });
    addElement(doc, o); addElement(doc, i);
    booleanOperation(doc, [o.id, i.id], 'subtract');
    const expected = Math.PI * (80 * 80 - 40 * 40);
    expect(Math.abs(area(doc) - expected)).toBeLessThan(expected * 0.01);
  });
  it('edge cases: identical shapes, touching edges, disjoint intersect, contained shapes', () => {
    const d1 = createDocument('d', 200, 200);
    const a = createRect(20, 20, 100, 100, { stroke: null }), b = createRect(20, 20, 100, 100, { stroke: null });
    addElement(d1, a); addElement(d1, b);
    booleanOperation(d1, [a.id, b.id], 'unite');
    expect(Math.abs(area(d1) - 10000)).toBeLessThan(150);

    const d2 = createDocument('d', 200, 200);
    const c = createRect(20, 20, 50, 50, { stroke: null }), e = createRect(70, 20, 50, 50, { stroke: null }); // share an edge
    addElement(d2, c); addElement(d2, e);
    booleanOperation(d2, [c.id, e.id], 'unite');
    expect(Math.abs(area(d2) - 5000)).toBeLessThan(150);

    const d3 = createDocument('d', 200, 200);
    const f = createRect(0, 0, 40, 40, { stroke: null }), g = createRect(100, 100, 40, 40, { stroke: null });
    addElement(d3, f); addElement(d3, g);
    expect(booleanOperation(d3, [f.id, g.id], 'intersect')).toBeNull();
    expect(d3.layers[0].children).toHaveLength(2); // untouched when empty

    const d4 = createDocument('d', 200, 200);
    const big = createRect(10, 10, 150, 150, { stroke: null }), small = createRect(50, 50, 40, 40, { stroke: null });
    addElement(d4, big); addElement(d4, small);
    booleanOperation(d4, [big.id, small.id], 'subtract');
    expect(Math.abs(area(d4) - (22500 - 1600))).toBeLessThan(250);
  });
  it('handles rotated operands and groups', () => {
    const { doc, a, b } = setup();
    transformWorld(doc, [b.id], aboutPoint(rotate(Math.PI / 4), { x: 120, y: 120 }));
    const before = area(doc);
    const id = booleanOperation(doc, [a.id, b.id], 'unite')!;
    expect(Math.abs(area(doc) - before)).toBeLessThan(250);
    expect(id).toBeTruthy();

    const g = setup();
    const c = createEllipse(60, 60, 20, 20, { stroke: null });
    addElement(g.doc, c);
    const gid = groupElements(g.doc, [g.a.id, c.id])!;
    const res = booleanOperation(g.doc, [gid, g.b.id], 'subtract');
    expect(res).not.toBeNull();
  });
  it('needs two objects and is undoable through History', () => {
    const { doc, a, b } = setup();
    expect(booleanOperation(doc, [a.id], 'unite')).toBeNull();
    const h = new History(doc);
    h.apply('Unite', (d) => { booleanOperation(d, [a.id, b.id], 'unite'); });
    expect(h.doc.layers[0].children).toHaveLength(1);
    h.undo();
    expect(h.doc.layers[0].children).toHaveLength(2);
  });
});

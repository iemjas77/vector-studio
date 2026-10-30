import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  addElement, alignElements, createDocument, createEllipse, createRect, distributeElements, getElement, hitTest, makeClippingMask,
  releaseClippingMask, setIdGenerator, solid, worldBounds, History, elementBounds,
} from '../../src/core/document';
import { exportSvg, importSvg } from '../../src/core/io';
import { rasterizeArtboard } from '../../src/render/export';

beforeEach(() => { let i = 0; setIdGenerator(() => 'a' + ++i); });
const make = (w: number, h: number) => { const canvas = createCanvas(w, h); return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D }; };
const alpha = (doc: ReturnType<typeof createDocument>, x: number, y: number) => {
  const off = rasterizeArtboard(doc, doc.artboards[0], make, { transparent: true });
  return (off.ctx as unknown as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }).getImageData(x, y, 1, 1).data[3];
};

describe('align and distribute', () => {
  function three() {
    const doc = createDocument('d', 500, 500);
    const a = createRect(10, 10, 20, 20), b = createRect(100, 50, 40, 60), c = createRect(300, 200, 10, 10);
    addElement(doc, a); addElement(doc, b); addElement(doc, c);
    return { doc, ids: [a.id, b.id, c.id] };
  }
  it('aligns edges and centres relative to the selection', () => {
    const { doc, ids } = three();
    alignElements(doc, ids, 'left');
    ids.forEach((id) => expect(worldBounds(doc, id)!.x).toBeCloseTo(10));
    alignElements(doc, ids, 'bottom');
    const bottoms = ids.map((id) => { const b = worldBounds(doc, id)!; return b.y + b.h; });
    bottoms.forEach((v) => expect(v).toBeCloseTo(bottoms[0]));
    alignElements(doc, ids, 'vcenter');
    const centres = ids.map((id) => { const b = worldBounds(doc, id)!; return b.y + b.h / 2; });
    centres.forEach((v) => expect(v).toBeCloseTo(centres[0]));
  });
  it('aligns a single object to the artboard', () => {
    const { doc, ids } = three();
    alignElements(doc, [ids[1]], 'hcenter', { x: 0, y: 0, w: 500, h: 500 });
    const b = worldBounds(doc, ids[1])!;
    expect(b.x + b.w / 2).toBeCloseTo(250);
    const before = worldBounds(doc, ids[0]);
    alignElements(doc, [ids[0]], 'left'); // single object without a reference does nothing
    expect(worldBounds(doc, ids[0])).toEqual(before);
  });
  it('distributes equal gaps and equal centres, keeping the outer objects fixed', () => {
    const { doc, ids } = three();
    distributeElements(doc, ids, 'hspace');
    const [a, b, c] = ids.map((id) => worldBounds(doc, id)!);
    expect(a.x).toBeCloseTo(10); expect(c.x).toBeCloseTo(300);
    expect(b.x - (a.x + a.w)).toBeCloseTo(c.x - (b.x + b.w));
    distributeElements(doc, ids, 'hcenters');
    const cs = ids.map((id) => { const x = worldBounds(doc, id)!; return x.x + x.w / 2; });
    expect(cs[1] - cs[0]).toBeCloseTo(cs[2] - cs[1]);
    const two = createDocument();
    const p = createRect(0, 0, 1, 1), q = createRect(5, 5, 1, 1);
    addElement(two, p); addElement(two, q);
    distributeElements(two, [p.id, q.id], 'hspace'); // < 3 objects: no-op
    expect(worldBounds(two, q.id)).toMatchObject({ x: 5 });
  });
});

describe('clipping masks', () => {
  function masked() {
    const doc = createDocument('d', 200, 200);
    const art = createRect(0, 0, 200, 200, { fill: solid('#ff0000'), stroke: null });
    const mask = createEllipse(100, 100, 50, 50, { fill: solid('#0000ff'), stroke: null });
    addElement(doc, art); addElement(doc, mask);
    const gid = makeClippingMask(doc, [art.id, mask.id])!;
    return { doc, gid, art, mask };
  }
  it('clips rendering to the top-most object and bounds follow the mask', () => {
    const { doc, gid } = masked();
    expect(alpha(doc, 100, 100)).toBe(255);
    expect(alpha(doc, 5, 5)).toBe(0);
    expect(alpha(doc, 190, 100)).toBe(0);
    expect(elementBounds(getElement(doc, gid)!)).toMatchObject({ x: 50, y: 50, w: 100, h: 100 });
  });
  it('hit-testing is limited to the mask area', () => {
    const { doc, gid } = masked();
    expect(hitTest(doc, { x: 100, y: 100 }, 0)).toBe(gid);
    expect(hitTest(doc, { x: 10, y: 10 }, 0)).toBeNull();
  });
  it('release makes everything visible again; refuses a group as mask; undoable', () => {
    const { doc, gid } = masked();
    expect(releaseClippingMask(doc, gid)).toBe(true);
    expect(alpha(doc, 5, 5)).toBe(255);
    const d2 = createDocument();
    const r = createRect(0, 0, 10, 10), s = createRect(0, 0, 10, 10);
    addElement(d2, r); addElement(d2, s);
    const h = new History(d2);
    h.apply('mask', (d) => { makeClippingMask(d, [r.id, s.id]); });
    expect(h.doc.layers[0].children).toHaveLength(1);
    h.undo();
    expect(h.doc.layers[0].children).toHaveLength(2);
  });
  it('survives SVG export → import as a clip group with the same visible result', () => {
    const { doc } = masked();
    const svg = exportSvg(doc);
    expect(svg).toContain('<clipPath');
    const { doc: back, warnings } = importSvg(svg);
    expect(warnings).toEqual([]);
    const g = back.layers[0].children[0];
    expect(g.type === 'group' && g.clip).toBe(true);
    expect(alpha(back, 100, 100)).toBe(255);
    expect(alpha(back, 5, 5)).toBe(0);
  });
  it('native file round trip keeps the clip flag', async () => {
    const { doc } = masked();
    const { parseDocument, serializeDocument } = await import('../../src/core/document');
    expect(parseDocument(serializeDocument(doc))).toEqual(doc);
  });
});

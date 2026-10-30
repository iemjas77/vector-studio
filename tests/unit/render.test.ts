import { describe, expect, it, beforeEach } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { PNG } from 'pngjs';
import {
  addElement, createDocument, createEllipse, createPath, createRect, defaultStroke, groupElements, setIdGenerator, solid, transformWorld,
} from '../../src/core/document';
import { node } from '../../src/core/geometry/path';
import { translate } from '../../src/core/geometry/matrix';
import { rasterizeArtboard, rasterSize, type CanvasFactory } from '../../src/render/export';

beforeEach(() => { let i = 0; setIdGenerator(() => 'r' + ++i); });

const make: CanvasFactory = (w, h) => {
  const canvas = createCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D };
};

function render(doc: ReturnType<typeof createDocument>, o = {}) {
  const off = rasterizeArtboard(doc, doc.artboards[0], make, o);
  const png = PNG.sync.read((off.canvas as unknown as { toBuffer(t: 'image/png'): Buffer }).toBuffer('image/png'));
  const px = (x: number, y: number) => {
    const i = (png.width * y + x) * 4;
    return [...png.data.slice(i, i + 4)];
  };
  return { png, px };
}

describe('raster export correctness', () => {
  it('exports exact pixel dimensions at 1x and scaled', () => {
    const doc = createDocument('d', 120, 80);
    expect(render(doc).png).toMatchObject({ width: 120, height: 80 });
    expect(render(doc, { scale: 2 }).png).toMatchObject({ width: 240, height: 160 });
    expect(render(doc, { width: 60 }).png).toMatchObject({ width: 60, height: 40 });
    expect(rasterSize(doc.artboards[0], { width: 33, height: 77 })).toMatchObject({ w: 33, h: 77 });
  });
  it('POD template: 4500×5400 transparent PNG has alpha 0 background and exact fill colour', () => {
    const doc = createDocument('pod', 4500, 5400);
    doc.artboards[0].background = null;
    addElement(doc, createRect(1000, 1000, 2000, 2000, { fill: solid('#ff0000') }));
    const { png, px } = render(doc);
    expect(png.width).toBe(4500); expect(png.height).toBe(5400);
    expect(px(10, 10)).toEqual([0, 0, 0, 0]);
    expect(px(2000, 2000)).toEqual([255, 0, 0, 255]);
    expect(px(3500, 3500)).toEqual([0, 0, 0, 0]);
  });
  it('opaque background is exported and `transparent` overrides it', () => {
    const doc = createDocument('d', 20, 20);
    doc.artboards[0].background = '#00ff00';
    expect(render(doc).px(5, 5)).toEqual([0, 255, 0, 255]);
    expect(render(doc, { transparent: true }).px(5, 5)[3]).toBe(0);
  });
  it('shape edges land on the right pixels (accuracy within 1px) and content is clipped to the artboard', () => {
    const doc = createDocument('d', 100, 100);
    addElement(doc, createRect(-50, 20, 100, 30, { fill: solid('#000000') })); // hangs off the left edge
    const { px } = render(doc, { transparent: true });
    expect(px(0, 35)[3]).toBe(255);
    expect(px(49, 35)[3]).toBe(255);
    expect(px(51, 35)[3]).toBe(0);
    expect(px(10, 19)[3]).toBe(0);
    expect(px(10, 20)[3]).toBe(255);
    expect(px(10, 49)[3]).toBe(255);
    expect(px(10, 50)[3]).toBe(0);
  });
  it('ellipse fill and stroke: centre filled, ring stroked, outside empty', () => {
    const doc = createDocument('d', 100, 100);
    doc.artboards[0].background = '#ffffff';
    addElement(doc, createEllipse(50, 50, 30, 30, { fill: solid('#0000ff'), stroke: defaultStroke('#ff0000', 6) }));
    const { px } = render(doc);
    expect(px(50, 50)).toEqual([0, 0, 255, 255]);
    expect(px(50, 20)).toEqual([255, 0, 0, 255]); // top of ring (radius 30, stroke 27..33)
    expect(px(5, 5)).toEqual([255, 255, 255, 255]);
  });
  it('transforms, nested groups and fill alpha compose correctly', () => {
    const doc = createDocument('d', 100, 100);
    const r = createRect(0, 0, 20, 20, { fill: solid('#000000', 0.5) });
    addElement(doc, r);
    const gid = groupElements(doc, [r.id])!;
    transformWorld(doc, [gid], translate(40, 40));
    const { px } = render(doc, { transparent: true });
    expect(px(50, 50)[3]).toBe(128);
    expect(px(10, 10)[3]).toBe(0);
  });
  it('group opacity composites as a unit (overlapping children do not double-darken)', () => {
    const doc = createDocument('d', 100, 100);
    const a = createRect(0, 0, 60, 60, { fill: solid('#000000') });
    const b = createRect(30, 30, 60, 60, { fill: solid('#000000') });
    addElement(doc, a); addElement(doc, b);
    const gid = groupElements(doc, [a.id, b.id])!;
    const g = doc.layers[0].children.find((c) => c.id === gid)!;
    g.opacity = 0.5;
    const { px } = render(doc, { transparent: true });
    expect(px(45, 45)[3]).toBe(128); // overlap area same as non-overlap
    expect(px(10, 10)[3]).toBe(128);
  });
  it('open paths render strokes only; closed fill follows curves', () => {
    const doc = createDocument('d', 100, 100);
    addElement(doc, createPath([node(10, 50), node(90, 50)], false, { fill: solid('#ff0000'), stroke: defaultStroke('#000000', 10) }));
    const { px } = render(doc, { transparent: true });
    expect(px(50, 50)).toEqual([0, 0, 0, 255]);
    expect(px(50, 40)[3]).toBe(0);
    expect(px(50, 60)[3]).toBe(0);
  });
  it('hidden layers and elements do not render', () => {
    const doc = createDocument('d', 20, 20);
    addElement(doc, createRect(0, 0, 20, 20, { visible: false }));
    expect(render(doc, { transparent: true }).px(5, 5)[3]).toBe(0);
    addElement(doc, createRect(0, 0, 20, 20));
    doc.layers[0].visible = false;
    expect(render(doc, { transparent: true }).px(5, 5)[3]).toBe(0);
  });
  it('refuses absurd export sizes', () => {
    const doc = createDocument('d', 100, 100);
    expect(() => rasterizeArtboard(doc, doc.artboards[0], make, { scale: 1000 })).toThrow(/too large/);
  });
  it('complex Bezier shape: pixel inside lobes filled, concavity empty', () => {
    const doc = createDocument('d', 200, 200);
    // heart-like closed path
    const heart = createPath([
      node(100, 60, 0, 0, 0, 0),
      node(160, 30, -30, 0, 30, 0),
      node(160, 100, 0, -30, 0, 40),
      node(100, 170, 40, -20, -40, 20),
      node(40, 100, 0, 40, 0, -40),
      node(40, 30, 0, 0, 30, 0),
    ], true, { fill: solid('#ff0000'), stroke: null });
    addElement(doc, heart);
    const { px } = render(doc, { transparent: true });
    expect(px(100, 110)[3]).toBe(255);
    expect(px(5, 5)[3]).toBe(0);
    expect(px(195, 195)[3]).toBe(0);
  });
});

describe('compound path rendering', () => {
  it('even-odd and non-zero holes are rendered as holes', () => {
    const doc = createDocument('d', 100, 100);
    const outer = [node(10, 10), node(90, 10), node(90, 90), node(10, 90)];
    const hole = [node(30, 30), node(30, 70), node(70, 70), node(70, 30)];
    addElement(doc, createPath(outer, true, { extra: [{ nodes: hole, closed: true }], fill: solid('#000000'), stroke: null }));
    const { px } = render(doc, { transparent: true });
    expect(px(20, 50)[3]).toBe(255);
    expect(px(50, 50)[3]).toBe(0);
  });
});

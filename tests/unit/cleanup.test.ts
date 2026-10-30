import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  addElement, cleanupDocument, computePalette, createDocument, createEllipse, createGroup, createPath, createRect, DEFAULT_CLEANUP, defaultStroke,
  listColors, reduceColors, replaceColor, resizeArtboardWithContent, setIdGenerator, solid, worldBounds, History, getElement,
} from '../../src/core/document';
import { node } from '../../src/core/geometry/path';
import { placeTrace, traceImage, TRACE_PRESETS } from '../../src/core/io';
import { exportSvg } from '../../src/core/io';

beforeEach(() => { let i = 0; setIdGenerator(() => 'c' + ++i); });

describe('vector cleanup', () => {
  it('removes hidden, invisible, tiny and empty things; merges duplicate anchors; keeps real artwork', () => {
    const doc = createDocument('d', 500, 500);
    const keep = createRect(10, 10, 100, 100);
    const hidden = createRect(0, 0, 50, 50, { visible: false });
    const speck = createRect(0, 0, 0.5, 0.5);
    const ghost = createPath([node(0, 0), node(50, 50)], false, { fill: null, stroke: null });
    const emptyGroup = createGroup([createRect(0, 0, 10, 10, { visible: false })]);
    const dup = createPath([node(0, 0), node(0.001, 0), node(100, 0), node(100, 100), node(0.002, 0.001)], true, { fill: solid('#000000') });
    [keep, hidden, speck, ghost, emptyGroup, dup].forEach((e) => addElement(doc, e));
    const rep = cleanupDocument(doc, DEFAULT_CLEANUP);
    const ids = doc.layers[0].children.map((c) => c.id);
    expect(ids).toEqual([keep.id, dup.id]);
    expect(rep.removedGroups).toBe(1);
    expect(rep.removedObjects).toBeGreaterThanOrEqual(4);
    const d = getElement(doc, dup.id);
    expect(d?.type === 'path' && d.nodes.length).toBe(3);
    expect(rep.removedNodes).toBe(2);
  });
  it('options switch behaviours off; hairline strokes are not "tiny"', () => {
    const doc = createDocument();
    const line = createPath([node(0, 0), node(100, 0)], false, { fill: null, stroke: defaultStroke('#000', 1) });
    const hidden = createRect(0, 0, 5, 5, { visible: false });
    addElement(doc, line); addElement(doc, hidden);
    cleanupDocument(doc, { ...DEFAULT_CLEANUP, removeHidden: false });
    expect(doc.layers[0].children).toHaveLength(2);
  });
  it('is undoable through History', () => {
    const doc = createDocument();
    addElement(doc, createRect(0, 0, 5, 5, { visible: false }));
    const h = new History(doc);
    h.apply('Clean up', (d) => { cleanupDocument(d, DEFAULT_CLEANUP); });
    expect(h.doc.layers[0].children).toHaveLength(0);
    h.undo();
    expect(h.doc.layers[0].children).toHaveLength(1);
  });
});

describe('colour reduction', () => {
  function palette() {
    const doc = createDocument();
    const cols = ['#ff0000', '#f80404', '#fe0a0a', '#0000ff', '#0a0af0', '#00ff00', '#101010', '#000000', '#ffffff', '#fafafa'];
    cols.forEach((c, i) => addElement(doc, createRect(i * 10, 0, 8, 8, { fill: solid(c), stroke: i === 0 ? defaultStroke('#fe0505', 2) : null })));
    return doc;
  }
  it('lists colours with counts and reduces to the requested number of clusters', () => {
    const doc = palette();
    expect(listColors(doc).length).toBeGreaterThanOrEqual(10);
    const r = reduceColors(doc, 4);
    expect(r.palette.length).toBeLessThanOrEqual(4);
    expect(listColors(doc).length).toBeLessThanOrEqual(4);
    // reds collapse together, blues together
    const cols = doc.layers[0].children.map((e) => (e.type !== 'group' && e.fill?.type === 'solid' ? e.fill.color : ''));
    expect(new Set(cols.slice(0, 3)).size).toBe(1);
    expect(cols[3]).toBe(cols[4]);
    expect(cols[3]).not.toBe(cols[0]);
    const first = doc.layers[0].children[0];
    expect(first.type !== 'group' && first.stroke?.paint.color).toBe(cols[0]); // strokes are remapped too
    expect(r.changed).toBeGreaterThan(0);
  });
  it('is deterministic and a no-op when already within the limit', () => {
    const a = palette(), b = palette();
    expect(reduceColors(a, 3).palette).toEqual(reduceColors(b, 3).palette);
    const doc = createDocument();
    addElement(doc, createRect(0, 0, 5, 5, { fill: solid('#123456') }));
    expect(reduceColors(doc, 5).changed).toBe(0);
    expect(computePalette([{ color: '#112233', count: 1 }], 3)).toEqual(['#112233']);
  });
  it('replaceColor swaps exact colours including gradient stops', () => {
    const doc = createDocument();
    addElement(doc, createRect(0, 0, 5, 5, { fill: solid('#ff0000') }));
    addElement(doc, createEllipse(5, 5, 5, 5, { fill: { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: '#ff0000', alpha: 1 }, { offset: 1, color: '#00ff00', alpha: 1 }] } }));
    expect(replaceColor(doc, '#FF0000', '#0000ff')).toBe(2);
    expect(listColors(doc).map((c) => c.color).sort()).toEqual(['#0000ff', '#00ff00']);
  });
});

describe('resize artboard with content (batch re-targeting)', () => {
  it('fit scales uniformly and centres; fill covers; none leaves content', () => {
    const mk = () => { const doc = createDocument('d', 1000, 1000); const r = createRect(250, 250, 500, 500); addElement(doc, r); return { doc, r }; };
    const a = mk();
    resizeArtboardWithContent(a.doc, a.doc.artboards[0].id, 2000, 1000, 'fit');
    expect(a.doc.artboards[0]).toMatchObject({ w: 2000, h: 1000 });
    const b = worldBounds(a.doc, a.r.id)!;
    expect(b.w).toBeCloseTo(500); expect(b.h).toBeCloseTo(500);        // limited by height: scale 1
    expect(b.x + b.w / 2).toBeCloseTo(1000); expect(b.y + b.h / 2).toBeCloseTo(500);
    const c = mk();
    resizeArtboardWithContent(c.doc, c.doc.artboards[0].id, 500, 500, 'fit');
    expect(worldBounds(c.doc, c.r.id)!.w).toBeCloseTo(250);
    const d = mk();
    resizeArtboardWithContent(d.doc, d.doc.artboards[0].id, 2000, 1000, 'fill');
    expect(worldBounds(d.doc, d.r.id)!.w).toBeCloseTo(1000);
    const e = mk();
    resizeArtboardWithContent(e.doc, e.doc.artboards[0].id, 300, 300, 'none');
    expect(worldBounds(e.doc, e.r.id)).toMatchObject({ x: 250, w: 500 });
    resizeArtboardWithContent(e.doc, e.doc.artboards[0].id, -1, 5, 'fit');   // invalid: ignored
    expect(e.doc.artboards[0].w).toBe(300);
  });
});

describe('image tracing', () => {
  function sample() {
    const c = createCanvas(120, 120);
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 120, 120);
    g.fillStyle = '#e02020'; g.beginPath(); g.arc(40, 60, 28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2040e0'; g.fillRect(70, 30, 40, 60);
    const id = g.getImageData(0, 0, 120, 120);
    return { width: 120, height: 120, data: id.data };
  }
  it('turns a raster into editable vector shapes with the right colours and positions', () => {
    const t = traceImage(sample(), TRACE_PRESETS.logo.options);
    expect(t.pathCount).toBeGreaterThanOrEqual(2);
    expect(t.pathCount).toBeLessThan(40);
    const doc = createDocument('d', 120, 120);
    doc.layers[0].children.push(...t.elements);
    const colors = listColors(doc).map((c) => c.color);
    expect(colors.some((c) => parseInt(c.slice(1, 3), 16) > 180 && parseInt(c.slice(3, 5), 16) < 90)).toBe(true);  // red-ish
    expect(colors.some((c) => parseInt(c.slice(5, 7), 16) > 180 && parseInt(c.slice(1, 3), 16) < 90)).toBe(true);   // blue-ish
    // background (white) removed
    expect(colors.some((c) => c === '#ffffff')).toBe(false);
    const svg = exportSvg(doc);
    expect(svg).toContain('<path');
    const circleBounds = t.elements.map((e) => worldBounds({ ...doc, layers: [{ ...doc.layers[0], children: [e] }] }, e.id)).filter(Boolean);
    expect(circleBounds.some((b) => b && b.w > 45 && b.w < 65)).toBe(true);
  });
  it('black & white preset gives two tones; limits and validation', () => {
    const bw = traceImage(sample(), TRACE_PRESETS.bw.options);
    const doc = createDocument();
    doc.layers[0].children.push(...bw.elements);
    expect(listColors(doc).length).toBeLessThanOrEqual(2);
    expect(() => traceImage({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, TRACE_PRESETS.logo.options)).toThrow(/Invalid image/);
    expect(() => traceImage({ width: 5000, height: 5000, data: new Uint8ClampedArray(4) }, TRACE_PRESETS.logo.options)).toThrow();
  });
  it('placeTrace scales down to fit and centres', () => {
    const t = traceImage(sample(), TRACE_PRESETS.logo.options);
    const g = placeTrace(t, 500, 500, 60, 60);
    expect(g.transform[0]).toBeCloseTo(0.5);
    expect(g.transform[4]).toBeCloseTo(500 - 30);
  });
});

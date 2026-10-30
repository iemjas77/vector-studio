import { describe, expect, it, beforeEach } from 'vitest';
import {
  History, addElement, addLayer, createDocument, createEllipse, createPath, createRect, defaultStroke, duplicateElements,
  elementBounds, groupElements, hitTest, locate, moveElement, parseDocument, patchElements, removeElements, removeLayer,
  reorder, serializeDocument, setIdGenerator, transformWorld, ungroupElements, worldBounds, DocumentFormatError, solid,
  setPathNodes, validateDocument, elementsInRect, selectionBounds, type VDocument,
} from '../../src/core/document';
import { node } from '../../src/core/geometry/path';
import { rotate, translate, scale, aboutPoint, multiply } from '../../src/core/geometry/matrix';

beforeEach(() => {
  let i = 0;
  setIdGenerator(() => 'id' + ++i);
});

function sample(): VDocument {
  const doc = createDocument('t', 800, 600);
  const r = createRect(10, 10, 100, 50, { rx: 5, stroke: defaultStroke('#ff0000', 3), fill: solid('#00ff00', 0.5) });
  const e = createEllipse(300, 200, 40, 20, { opacity: 0.5, name: 'Moon' });
  const p = createPath([node(0, 0, 0, 0, 10, 20), node(100, 100, -10, -20, 0, 0), node(0, 100)], true, { transform: [1, 0.2, -0.1, 1, 5, 6] });
  doc.layers[0].children.push(r, e, p);
  return doc;
}

describe('serialization', () => {
  it('round-trips every property without loss', () => {
    const doc = sample();
    const back = parseDocument(serializeDocument(doc));
    expect(back).toEqual(doc);
  });
  it('round-trips groups, hidden/locked flags, dashes and multiple artboards/layers', () => {
    const doc = sample();
    addLayer(doc, 'Second');
    doc.layers[1].locked = true;
    doc.artboards.push({ id: 'ab2', name: 'B', x: 900, y: 0, w: 4500, h: 5400, background: null });
    const g = groupElements(doc, [doc.layers[0].children[0].id, doc.layers[0].children[1].id])!;
    const loc = locate(doc, g)!;
    loc.element.visible = false;
    (doc.layers[0].children[1] as { stroke: ReturnType<typeof defaultStroke> | null }).stroke = { ...defaultStroke(), dash: [4, 2], cap: 'round', join: 'bevel' };
    expect(parseDocument(serializeDocument(doc))).toEqual(doc);
  });
  it('rejects malformed input with readable errors', () => {
    expect(() => parseDocument('not json')).toThrow(DocumentFormatError);
    expect(() => parseDocument('{}')).toThrow(/Not a Vector Studio/);
    expect(() => parseDocument('null')).toThrow(DocumentFormatError);
    const doc = sample();
    const bad = JSON.parse(serializeDocument(doc));
    bad.layers[0].children[0].w = 'wide';
    expect(() => validateDocument(bad)).toThrow(/layers\.0\.children\.0\.w/);
    const dup = JSON.parse(serializeDocument(doc));
    dup.layers[0].children[1].id = dup.layers[0].children[0].id;
    expect(() => validateDocument(dup)).toThrow(/Duplicate id/);
    const future = JSON.parse(serializeDocument(doc));
    future.version = 99;
    expect(() => validateDocument(future)).toThrow(/newer/);
    const empty = JSON.parse(serializeDocument(doc));
    empty.artboards = [];
    expect(() => validateDocument(empty)).toThrow(DocumentFormatError);
    const nan = JSON.parse(serializeDocument(doc).replace('"w":100', '"w":null'));
    expect(() => validateDocument(nan)).toThrow(DocumentFormatError);
  });
});

describe('history', () => {
  it('undo/redo restores exact earlier documents', () => {
    const h = new History(sample());
    const s0 = h.doc;
    const id = h.doc.layers[0].children[0].id;
    h.apply('move', (d) => transformWorld(d, [id], translate(5, 5)));
    const s1 = h.doc;
    h.apply('delete', (d) => removeElements(d, [id]));
    const s2 = h.doc;
    expect(h.undoLabel).toBe('delete');
    h.undo(); expect(h.doc).toBe(s1);
    h.undo(); expect(h.doc).toBe(s0);
    expect(h.undo()).toBe(false);
    h.redo(); expect(h.doc).toBe(s1);
    h.redo(); expect(h.doc).toBe(s2);
    expect(h.redo()).toBe(false);
  });
  it('a new edit clears redo; no-op edits record nothing', () => {
    const h = new History(sample());
    const id = h.doc.layers[0].children[0].id;
    h.apply('a', (d) => patchElements(d, [id], { opacity: 0.2 }));
    h.undo();
    expect(h.canRedo).toBe(true);
    expect(h.apply('noop', () => {})).toBe(false);
    expect(h.canRedo).toBe(true);
    h.apply('b', (d) => patchElements(d, [id], { opacity: 0.3 }));
    expect(h.canRedo).toBe(false);
  });
  it('a drag transaction is one undo step and cancel restores the base', () => {
    const h = new History(sample());
    const id = h.doc.layers[0].children[0].id;
    const start = h.doc;
    h.begin();
    for (let i = 0; i < 50; i++) h.update((d) => transformWorld(d, [id], translate(1, 0)));
    expect(h.commit('drag')).toBe(true);
    h.undo();
    expect(h.doc).toBe(start);
    h.begin(); h.update((d) => transformWorld(d, [id], translate(9, 9))); h.cancel();
    expect(h.doc).toBe(start);
  });
  it('random edit/undo sequences always return to the initial document', () => {
    const h = new History(sample());
    const initial = h.doc;
    const ids = h.doc.layers[0].children.map((c) => c.id);
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let edits = 0;
    for (let i = 0; i < 200; i++) {
      const id = ids[Math.floor(rnd() * ids.length)];
      const k = Math.floor(rnd() * 4);
      const ok = h.apply('e', (d) => {
        if (k === 0) transformWorld(d, [id], translate(rnd() * 10 + 1, 3));
        else if (k === 1) patchElements(d, [id], { opacity: rnd() });
        else if (k === 2) transformWorld(d, [id], aboutPoint(rotate(rnd()), { x: 50, y: 50 }));
        else reorder(d, [id], 'front');
      });
      if (ok) edits++;
    }
    expect(edits).toBeGreaterThan(100);
    while (h.undo());
    expect(h.doc).toBe(initial);
    while (h.redo());
    expect(h.canRedo).toBe(false);
  });
  it('tracks dirty state against the saved snapshot', () => {
    const h = new History(sample());
    expect(h.dirty).toBe(false);
    h.apply('x', (d) => { d.name = 'changed'; });
    expect(h.dirty).toBe(true);
    h.markSaved();
    expect(h.dirty).toBe(false);
    h.undo();
    expect(h.dirty).toBe(true);
  });
  it('limits stack size', () => {
    const h = new History(sample(), 5);
    for (let i = 0; i < 20; i++) h.apply('x', (d) => { d.name = 'n' + i; });
    let n = 0; while (h.undo()) n++;
    expect(n).toBe(5);
  });
});

describe('operations', () => {
  it('transformWorld moves elements by exact deltas, also inside transformed groups', () => {
    const doc = sample();
    const [r, e] = doc.layers[0].children;
    const gid = groupElements(doc, [r.id, e.id])!;
    const g = locate(doc, gid)!.element;
    g.transform = multiply(translate(100, 0), scale(2));
    const before = worldBounds(doc, r.id)!;
    transformWorld(doc, [r.id], translate(10, 20));
    const after = worldBounds(doc, r.id)!;
    expect(after.x - before.x).toBeCloseTo(10);
    expect(after.y - before.y).toBeCloseTo(20);
    expect(after.w).toBeCloseTo(before.w);
  });
  it('rotating a rectangle gives exact rotated bounds', () => {
    const doc = createDocument();
    const r = createRect(0, 0, 100, 100);
    addElement(doc, r);
    transformWorld(doc, [r.id], aboutPoint(rotate(Math.PI / 4), { x: 50, y: 50 }));
    const b = worldBounds(doc, r.id)!;
    expect(b.w).toBeCloseTo(Math.SQRT2 * 100);
    expect(b.x + b.w / 2).toBeCloseTo(50);
  });
  it('group / ungroup preserve world geometry and z-order', () => {
    const doc = sample();
    const ids = doc.layers[0].children.map((c) => c.id);
    const before = ids.map((i) => worldBounds(doc, i)!);
    const gid = groupElements(doc, [ids[0], ids[2]])!;
    expect(doc.layers[0].children.map((c) => c.id)).toEqual([ids[1], gid]); // inserted at the topmost selected slot
    locate(doc, gid)!.element.transform = translate(30, 0);
    const moved = worldBounds(doc, ids[0])!;
    expect(moved.x).toBeCloseTo(before[0].x + 30);
    const out = ungroupElements(doc, [gid]);
    expect(out).toEqual([ids[0], ids[2]]);
    const after = worldBounds(doc, ids[0])!;
    expect(after.x).toBeCloseTo(before[0].x + 30);
    expect(after.w).toBeCloseTo(before[0].w);
  });
  it('reorder front/back/forward/backward', () => {
    const doc = sample();
    const ids = doc.layers[0].children.map((c) => c.id);
    const order = () => doc.layers[0].children.map((c) => c.id);
    reorder(doc, [ids[0]], 'front'); expect(order()).toEqual([ids[1], ids[2], ids[0]]);
    reorder(doc, [ids[0]], 'backward'); expect(order()).toEqual([ids[1], ids[0], ids[2]]);
    reorder(doc, [ids[2]], 'back'); expect(order()).toEqual([ids[2], ids[1], ids[0]]);
    reorder(doc, [ids[2]], 'forward'); expect(order()).toEqual([ids[1], ids[2], ids[0]]);
    reorder(doc, [ids[0]], 'forward'); expect(order()).toEqual([ids[1], ids[2], ids[0]]); // already top
  });
  it('duplicate creates fresh ids and offsets', () => {
    const doc = sample();
    const src = doc.layers[0].children[0].id;
    const [copy] = duplicateElements(doc, [src], 10, 10);
    expect(copy).not.toBe(src);
    expect(worldBounds(doc, copy)!.x).toBeCloseTo(worldBounds(doc, src)!.x + 10);
    expect(new Set(doc.layers[0].children.map((c) => c.id)).size).toBe(4);
  });
  it('moveElement between layers keeps world position', () => {
    const doc = sample();
    const l2 = addLayer(doc, 'two');
    const id = doc.layers[0].children[0].id;
    const b = worldBounds(doc, id)!;
    moveElement(doc, id, l2, 0);
    expect(doc.layers[1].children[0].id).toBe(id);
    expect(worldBounds(doc, id)).toEqual(b);
  });
  it('a document always keeps one layer', () => {
    const doc = createDocument();
    removeLayer(doc, doc.layers[0].id);
    expect(doc.layers).toHaveLength(1);
  });
  it('setPathNodes converts a rectangle into an editable path and keeps its look', () => {
    const doc = sample();
    const r = doc.layers[0].children[0];
    const b0 = elementBounds(r)!;
    setPathNodes(doc, r.id, [node(0, 0), node(10, 0), node(10, 10)], true);
    const p = locate(doc, r.id)!.element;
    expect(p.type).toBe('path');
    if (p.type === 'path') expect(p.stroke?.width).toBe(3);
    expect(b0.w).toBe(100);
  });
  it('selectionBounds and marquee', () => {
    const doc = sample();
    const ids = doc.layers[0].children.map((c) => c.id);
    const b = selectionBounds(doc, ids.slice(0, 2))!;
    expect(b.x).toBeCloseTo(10);
    expect(b.x + b.w).toBeCloseTo(340);
    expect(elementsInRect(doc, { x: 0, y: 0, w: 120, h: 70 })).toContain(ids[0]);
    expect(elementsInRect(doc, { x: 500, y: 500, w: 5, h: 5 })).toEqual([]);
  });
});

describe('hit testing', () => {
  it('filled shapes hit inside, stroke-only shapes hit only on the stroke', () => {
    const doc = createDocument();
    const filled = createRect(0, 0, 100, 100);
    const hollow = createRect(200, 0, 100, 100, { fill: null, stroke: defaultStroke('#000', 4) });
    doc.layers[0].children.push(filled, hollow);
    expect(hitTest(doc, { x: 50, y: 50 }, 2)).toBe(filled.id);
    expect(hitTest(doc, { x: 250, y: 50 }, 2)).toBeNull();
    expect(hitTest(doc, { x: 200, y: 50 }, 2)).toBe(hollow.id);
    expect(hitTest(doc, { x: 201.5, y: 50 }, 0)).toBe(hollow.id);
    expect(hitTest(doc, { x: 203.5, y: 50 }, 0)).toBeNull();
    expect(hitTest(doc, { x: 215, y: 50 }, 2)).toBeNull();
  });
  it('picks the topmost element and ignores hidden, locked layers and locked elements', () => {
    const doc = createDocument();
    const a = createRect(0, 0, 100, 100), b = createRect(50, 50, 100, 100);
    doc.layers[0].children.push(a, b);
    expect(hitTest(doc, { x: 75, y: 75 }, 0)).toBe(b.id);
    b.locked = true;
    expect(hitTest(doc, { x: 75, y: 75 }, 0)).toBe(a.id);
    b.locked = false; b.visible = false;
    expect(hitTest(doc, { x: 75, y: 75 }, 0)).toBe(a.id);
    doc.layers[0].locked = true;
    expect(hitTest(doc, { x: 75, y: 75 }, 0)).toBeNull();
  });
  it('hits transformed ellipses correctly and respects concave closed paths', () => {
    const doc = createDocument();
    const el = createEllipse(0, 0, 50, 10, { transform: [0, 1, -1, 0, 100, 100] }); // rotated 90°: tall ellipse
    const L = createPath([node(300, 0), node(400, 0), node(400, 40), node(340, 40), node(340, 100), node(300, 100)], true);
    doc.layers[0].children.push(el, L);
    expect(hitTest(doc, { x: 100, y: 140 }, 0)).toBe(el.id);
    expect(hitTest(doc, { x: 140, y: 100 }, 0)).toBeNull();
    expect(hitTest(doc, { x: 380, y: 80 }, 0)).toBeNull();
    expect(hitTest(doc, { x: 320, y: 80 }, 0)).toBe(L.id);
  });
  it('groups are one object unless deep', () => {
    const doc = createDocument();
    const a = createRect(0, 0, 10, 10), b = createRect(100, 0, 10, 10);
    doc.layers[0].children.push(a, b);
    const gid = groupElements(doc, [a.id, b.id])!;
    expect(hitTest(doc, { x: 5, y: 5 }, 0)).toBe(gid);
    expect(hitTest(doc, { x: 5, y: 5 }, 0, true)).toBe(a.id);
  });
});

describe('large documents', () => {
  it('handles 20k elements: edit, undo and serialise round-trip within time budget', () => {
    const doc = createDocument();
    for (let i = 0; i < 20000; i++) doc.layers[0].children.push(createRect((i % 200) * 12, Math.floor(i / 200) * 12, 10, 10));
    const h = new History(doc);
    const t0 = performance.now();
    const target = h.doc.layers[0].children[19999].id;
    h.apply('move', (d) => transformWorld(d, [target], translate(1, 1)));
    h.undo();
    const text = serializeDocument(h.doc);
    const back = parseDocument(text);
    const dt = performance.now() - t0;
    expect(back.layers[0].children).toHaveLength(20000);
    expect(dt).toBeLessThan(5000);
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) hitTest(h.doc, { x: 1000, y: 1000 }, 1);
    expect((performance.now() - t1) / 20).toBeLessThan(100);
  });
});

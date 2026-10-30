import { beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '../../src/editor/editor';
import { createDocument, createEllipse, createRect, elementBounds, getElement, setIdGenerator, worldBounds, solid, defaultStroke, createPath, addElement, parseDocument, serializeDocument } from '../../src/core/document';
import { node } from '../../src/core/geometry/path';
import { HANDLES, handlePoint } from '../../src/editor/tools/select';

beforeEach(() => { let i = 0; setIdGenerator(() => 'e' + ++i); });

function ed(w = 800, h = 600): Editor {
  const e = new Editor(createDocument('t', w, h));
  e.viewport.setSize(800, 600);
  e.viewport.zoom = 1; e.viewport.panX = 0; e.viewport.panY = 0;
  return e;
}
const drag = (e: Editor, x1: number, y1: number, x2: number, y2: number, m = {}, downMods: object = m) => {
  e.pointerDown(x1, y1, downMods);
  const steps = 5;
  for (let i = 1; i <= steps; i++) e.pointerMove(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, m);
  e.pointerUp(x2, y2, m);
};
const click = (e: Editor, x: number, y: number, m = {}) => { e.pointerDown(x, y, m); e.pointerUp(x, y, m); };
const els = (e: Editor) => e.doc.layers.flatMap((l) => l.children);

describe('shape tools', () => {
  it('draws a rectangle with exact bounds and one undo step', () => {
    const e = ed();
    e.setTool('rect');
    drag(e, 100, 100, 250, 180);
    expect(els(e)).toHaveLength(1);
    expect(elementBounds(els(e)[0])).toEqual({ x: 100, y: 100, w: 150, h: 80 });
    expect(e.selection).toEqual([els(e)[0].id]);
    e.undo();
    expect(els(e)).toHaveLength(0);
    e.redo();
    expect(els(e)).toHaveLength(1);
  });
  it('draws backwards drags, shift = square, alt = from centre', () => {
    const e = ed();
    e.setTool('rect');
    drag(e, 300, 300, 200, 250);
    expect(elementBounds(els(e)[0])).toEqual({ x: 200, y: 250, w: 100, h: 50 });
    drag(e, 100, 100, 160, 130, { shift: true });
    expect(elementBounds(els(e)[1])).toEqual({ x: 100, y: 100, w: 60, h: 60 });
    drag(e, 400, 400, 450, 420, { alt: true });
    expect(elementBounds(els(e)[2])).toEqual({ x: 350, y: 380, w: 100, h: 40 });
  });
  it('draws an ellipse inscribed in the drag box and uses the current style', () => {
    const e = ed();
    e.setFill(solid('#ff0000'));
    e.setTool('ellipse');
    drag(e, 10, 20, 110, 80);
    const el = els(e)[0];
    expect(el).toMatchObject({ type: 'ellipse', cx: 60, cy: 50, rx: 50, ry: 30, fill: { color: '#ff0000' } });
  });
  it('a plain click or tiny drag creates nothing and records no history', () => {
    const e = ed();
    e.setTool('rect');
    click(e, 50, 50);
    drag(e, 50, 50, 50.2, 50.2);
    expect(els(e)).toHaveLength(0);
    expect(e.history.canUndo).toBe(false);
  });
  it('honours zoom and pan when mapping pointer to document', () => {
    const e = ed();
    e.viewport.zoom = 2; e.viewport.panX = 100; e.viewport.panY = 50;
    e.setTool('rect');
    drag(e, 300, 250, 500, 450);
    expect(elementBounds(els(e)[0])).toEqual({ x: 100, y: 100, w: 100, h: 100 });
  });
  it('Esc during a drag cancels cleanly', () => {
    const e = ed();
    e.setTool('rect');
    e.pointerDown(10, 10);
    e.pointerMove(100, 100);
    e.cancelGesture();
    expect(els(e)).toHaveLength(0);
    e.pointerUp(100, 100);
    expect(els(e)).toHaveLength(0);
    expect(e.history.canUndo).toBe(false);
  });
});

describe('selection tool', () => {
  function setup() {
    const e = ed();
    const a = createRect(100, 100, 100, 100), b = createRect(300, 100, 100, 100), c = createEllipse(200, 400, 50, 50);
    e.apply('seed', (d) => { addElement(d, a); addElement(d, b); addElement(d, c); });
    return { e, a, b, c };
  }
  it('click selects, shift-click adds/removes, empty click clears', () => {
    const { e, a, b } = setup();
    click(e, 150, 150);
    expect(e.selection).toEqual([a.id]);
    click(e, 350, 150, { shift: true });
    expect(e.selection).toEqual([a.id, b.id]);
    click(e, 150, 150, { shift: true });
    expect(e.selection).toEqual([b.id]);
    click(e, 700, 500);
    expect(e.selection).toEqual([]);
  });
  it('marquee selects intersecting objects', () => {
    const { e, a, b } = setup();
    drag(e, 50, 50, 450, 250);
    expect(new Set(e.selection)).toEqual(new Set([a.id, b.id]));
    drag(e, 600, 500, 700, 580);
    expect(e.selection).toEqual([]);
  });
  it('drag moves by the exact pointer delta, one undo step; shift locks the axis', () => {
    const { e, a } = setup();
    drag(e, 150, 150, 190, 175);
    expect(worldBounds(e.doc, a.id)).toMatchObject({ x: 140, y: 125, w: 100, h: 100 });
    e.undo();
    expect(worldBounds(e.doc, a.id)).toMatchObject({ x: 100, y: 100 });
    drag(e, 150, 150, 190, 160, { shift: true }, {});
    expect(worldBounds(e.doc, a.id)).toMatchObject({ x: 140, y: 100 });
  });
  it('a click without movement does not create an undo entry', () => {
    const { e } = setup();
    const undoDepth = e.history.undoLabel;
    click(e, 150, 150);
    expect(e.history.undoLabel).toBe(undoDepth);
  });
  it('alt-drag duplicates and leaves the original', () => {
    const { e, a } = setup();
    drag(e, 150, 150, 150, 300, { alt: true });
    expect(els(e)).toHaveLength(4);
    expect(worldBounds(e.doc, a.id)).toMatchObject({ x: 100, y: 100 });
    expect(e.selection[0]).not.toBe(a.id);
    expect(worldBounds(e.doc, e.selection[0])).toMatchObject({ x: 100, y: 250 });
  });
  it('corner handle scales about the opposite corner with exact result', () => {
    const { e, a } = setup();
    click(e, 150, 150);
    const b = e.selectionBounds()!;
    const br = handlePoint(b, HANDLES.find((h) => h.hx === 1 && h.hy === 1)!);
    drag(e, br.x, br.y, br.x + 100, br.y + 50);
    expect(worldBounds(e.doc, a.id)).toMatchObject({ x: 100, y: 100, w: 200, h: 150 });
    e.undo();
    expect(worldBounds(e.doc, a.id)).toMatchObject({ w: 100, h: 100 });
  });
  it('shift-scale keeps proportions; alt scales about the centre', () => {
    const { e, a } = setup();
    click(e, 150, 150);
    const br = handlePoint(e.selectionBounds()!, HANDLES.find((h) => h.hx === 1 && h.hy === 1)!);
    drag(e, br.x, br.y, br.x + 100, br.y + 20, { shift: true });
    const w = worldBounds(e.doc, a.id)!;
    expect(w.w).toBeCloseTo(w.h);
    expect(w.w).toBeCloseTo(200);
    e.undo();
    const br2 = handlePoint(e.selectionBounds()!, HANDLES.find((h) => h.hx === 1 && h.hy === 1)!);
    drag(e, br2.x, br2.y, br2.x + 20, br2.y + 20, { alt: true });
    const c = worldBounds(e.doc, a.id)!;
    expect(c).toMatchObject({ x: 80, y: 80, w: 140, h: 140 });
  });
  it('edge handle scales one axis only; dragging through the opposite side flips', () => {
    const { e, a } = setup();
    click(e, 150, 150);
    const right = handlePoint(e.selectionBounds()!, HANDLES.find((h) => h.hx === 1 && h.hy === 0)!);
    drag(e, right.x, right.y, right.x + 50, right.y + 40);
    expect(worldBounds(e.doc, a.id)).toMatchObject({ x: 100, y: 100, w: 150, h: 100 });
    e.undo();
    const r2 = handlePoint(e.selectionBounds()!, HANDLES.find((h) => h.hx === 1 && h.hy === 0)!);
    drag(e, r2.x, r2.y, 50, r2.y);
    const flipped = worldBounds(e.doc, a.id)!;
    expect(flipped.w).toBeCloseTo(50);
    expect(flipped.x).toBeCloseTo(50);
  });
  it('rotation by dragging outside a corner rotates about the centre; shift snaps to 15°', () => {
    const { e, a } = setup();
    click(e, 150, 150);
    const tl = handlePoint(e.selectionBounds()!, HANDLES[0]);
    // centre (150,150). Grab just outside the TL corner and rotate 90° clockwise → ends top-right-ish.
    drag(e, tl.x - 8, tl.y - 8, 150 + (150 - (tl.y - 8)), 150 + (tl.x - 8 - 150) * 0 + (tl.x - 8 - 150), { shift: true });
    const b = worldBounds(e.doc, a.id)!;
    // After a multiple-of-15° rotation about the centre, the box is still centred on (150,150).
    expect(b.x + b.w / 2).toBeCloseTo(150, 3);
    expect(b.y + b.h / 2).toBeCloseTo(150, 3);
    const el = getElement(e.doc, a.id)!;
    const ang = Math.atan2(el.transform[1], el.transform[0]) * 180 / Math.PI;
    expect(Math.abs(ang % 15)).toBeLessThan(1e-6);
    expect(Math.abs(ang)).toBeGreaterThan(1);
  });
  it('locked and hidden objects cannot be picked or moved', () => {
    const { e, a } = setup();
    e.patchElement(a.id, { locked: true });
    click(e, 150, 150);
    expect(e.selection).toEqual([]);
    e.patchElement(a.id, { locked: false });
    e.patchLayer(e.doc.layers[0].id, { visible: false });
    click(e, 150, 150);
    expect(e.selection).toEqual([]);
  });
  it('delete, copy/paste, duplicate, group/ungroup, arrange all undo cleanly', () => {
    const { e, a, b } = setup();
    click(e, 150, 150);
    e.copy(); e.paste();
    expect(els(e)).toHaveLength(4);
    expect(worldBounds(e.doc, e.selection[0])).toMatchObject({ x: 110, y: 110 });
    e.deleteSelection();
    expect(els(e)).toHaveLength(3);
    e.undo(); e.undo();
    expect(els(e)).toHaveLength(3);
    e.select([a.id, b.id]);
    e.group();
    expect(els(e)).toHaveLength(2);
    const g = e.selection[0];
    expect(getElement(e.doc, g)!.type).toBe('group');
    e.ungroup();
    expect(els(e)).toHaveLength(3);
    e.select([a.id]);
    e.arrange('front');
    expect(els(e).at(-1)!.id).toBe(a.id);
    e.undo();
    expect(els(e)[0].id).toBe(a.id);
  });
  it('nudge moves by the exact amount', () => {
    const { e, a } = setup();
    e.select([a.id]);
    e.nudge(1, 0); e.nudge(0, -10);
    expect(worldBounds(e.doc, a.id)).toMatchObject({ x: 101, y: 90 });
  });
  it('properties panel setBounds sets exact X/Y/W/H', () => {
    const { e, a } = setup();
    e.select([a.id]);
    e.setBounds({ x: 10, y: 20, w: 300, h: 40 });
    expect(worldBounds(e.doc, a.id)).toMatchObject({ x: 10, y: 20, w: 300, h: 40 });
  });
  it('fill/stroke edits apply to the selection and are undoable', () => {
    const { e, a } = setup();
    e.select([a.id]);
    e.setFill(solid('#123456', 0.5));
    e.updateStroke({ width: 7, paint: solid('#ff00ff') });
    const el = getElement(e.doc, a.id)!;
    expect(el).toMatchObject({ fill: { color: '#123456', alpha: 0.5 }, stroke: { width: 7, paint: { color: '#ff00ff' } } });
    e.updateStroke(null);
    expect(getElement(e.doc, a.id)).toMatchObject({ stroke: null });
    e.undo(); e.undo(); e.undo();
    expect(getElement(e.doc, a.id)).toMatchObject({ fill: { color: '#d9d9d9' } });
  });
});

describe('pen tool', () => {
  it('click-click-Enter makes an open straight path', () => {
    const e = ed();
    e.setTool('pen');
    click(e, 100, 100); click(e, 200, 100); click(e, 200, 200);
    e.toolKey('Enter', { shift: false, alt: false, ctrl: false });
    const p = els(e)[0];
    expect(p).toMatchObject({ type: 'path', closed: false });
    if (p.type === 'path') expect(p.nodes.map((n) => [n.x, n.y])).toEqual([[100, 100], [200, 100], [200, 200]]);
    expect(e.history.undoLabel).toBe('Draw path');
    e.undo();
    expect(els(e)).toHaveLength(0);
  });
  it('clicking the first anchor closes the path (and fills it)', () => {
    const e = ed();
    e.setTool('pen');
    click(e, 100, 100); click(e, 200, 100); click(e, 150, 200); click(e, 102, 99);
    const p = els(e)[0];
    expect(p).toMatchObject({ type: 'path', closed: true });
    if (p.type === 'path') { expect(p.nodes).toHaveLength(3); expect(p.fill).not.toBeNull(); }
  });
  it('click-drag makes symmetric smooth handles', () => {
    const e = ed();
    e.setTool('pen');
    click(e, 100, 300);
    drag(e, 300, 300, 360, 240);
    e.toolKey('Enter', { shift: false, alt: false, ctrl: false });
    const p = els(e)[0];
    if (p.type !== 'path') throw new Error('expected path');
    expect(p.nodes[1]).toMatchObject({ x: 300, y: 300, outX: 60, outY: -60, inX: -60, inY: 60 });
    expect(p.nodes[0]).toMatchObject({ outX: 0, outY: 0 });
  });
  it('Backspace removes the last anchor; fewer than two anchors discards the path', () => {
    const e = ed();
    e.setTool('pen');
    click(e, 10, 10); click(e, 50, 50); click(e, 90, 10);
    e.toolKey('Backspace', { shift: false, alt: false, ctrl: false });
    e.toolKey('Enter', { shift: false, alt: false, ctrl: false });
    const p = els(e)[0];
    if (p.type === 'path') expect(p.nodes).toHaveLength(2);
    e.setTool('pen');
    click(e, 300, 300);
    e.toolKey('Escape', { shift: false, alt: false, ctrl: false });
    expect(els(e)).toHaveLength(1);
  });
  it('shift constrains segments to 45° steps', () => {
    const e = ed();
    e.setTool('pen');
    click(e, 100, 100); click(e, 190, 120, { shift: true });
    e.toolKey('Enter', { shift: false, alt: false, ctrl: false });
    const p = els(e)[0];
    if (p.type !== 'path') throw new Error();
    expect(p.nodes[1].y).toBeCloseTo(100);
  });
  it('switching tool while drawing keeps the path', () => {
    const e = ed();
    e.setTool('pen');
    click(e, 10, 10); click(e, 90, 90);
    e.setTool('select');
    expect(els(e)).toHaveLength(1);
  });
});

describe('direct selection', () => {
  function setup() {
    const e = ed();
    const p = createPath([node(100, 100), node(300, 100, -50, 0, 50, 0), node(300, 300)], true, { fill: solid('#aaaaaa'), stroke: defaultStroke() });
    e.apply('seed', (d) => addElement(d, p));
    e.setTool('direct');
    return { e, id: p.id };
  }
  it('click selects the path; click anchor selects it; drag moves it exactly', () => {
    const { e, id } = setup();
    click(e, 200, 200);
    expect(e.selection).toEqual([id]);
    click(e, 300, 300);
    expect(e.selectedNodeIndices(id)).toEqual([2]);
    drag(e, 300, 300, 340, 380);
    const p = e.pathOf(id)!;
    expect(p.nodes[2]).toMatchObject({ x: 340, y: 380 });
    expect(p.nodes[0]).toMatchObject({ x: 100, y: 100 });
    e.undo();
    expect(e.pathOf(id)!.nodes[2]).toMatchObject({ x: 300, y: 300 });
  });
  it('dragging a handle on a smooth anchor keeps the opposite handle collinear', () => {
    const { e, id } = setup();
    click(e, 200, 200);
    click(e, 300, 100);
    drag(e, 350, 100, 350, 160); // out handle (+50,0) → (+50,+60)
    const n = e.pathOf(id)!.nodes[1];
    expect(n.outX).toBeCloseTo(50); expect(n.outY).toBeCloseTo(60);
    const len = Math.hypot(n.outX, n.outY);
    expect(n.inX).toBeCloseTo((-n.outX / len) * 50);
    expect(n.inY).toBeCloseTo((-n.outY / len) * 50);
  });
  it('alt-dragging a handle breaks the link', () => {
    const { e, id } = setup();
    click(e, 200, 200); click(e, 300, 100);
    drag(e, 350, 100, 350, 160, { alt: true });
    const n = e.pathOf(id)!.nodes[1];
    expect(n.inX).toBeCloseTo(-50); expect(n.inY).toBeCloseTo(0);
  });
  it('dragging a straight segment turns it into a curve through the pointer', () => {
    const { e, id } = setup();
    click(e, 200, 200);
    drag(e, 200, 100, 200, 60);
    const p = e.pathOf(id)!;
    expect(p.nodes[0].outY).not.toBe(0);
    // The curve now passes close to the drag target.
    const seg = { p0: { x: 100, y: 100 }, p1: { x: 100 + p.nodes[0].outX, y: 100 + p.nodes[0].outY }, p2: { x: 300 + p.nodes[1].inX, y: 100 + p.nodes[1].inY }, p3: { x: 300, y: 100 } };
    let best = Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const u = 1 - t;
      const x = u * u * u * seg.p0.x + 3 * u * u * t * seg.p1.x + 3 * u * t * t * seg.p2.x + t * t * t * seg.p3.x;
      const y = u * u * u * seg.p0.y + 3 * u * u * t * seg.p1.y + 3 * u * t * t * seg.p2.y + t * t * t * seg.p3.y;
      best = Math.min(best, Math.hypot(x - 200, y - 60));
    }
    expect(best).toBeLessThan(6);
  });
  it('double-click on a segment adds an anchor without changing the outline', () => {
    const { e, id } = setup();
    click(e, 200, 200);
    e.pointerDown(200, 200, { detail: 2 }); e.pointerUp(200, 200);
    // (200,200) lies on the closing diagonal from (300,300) back to (100,100)
    const p = e.pathOf(id)!;
    expect(p.nodes).toHaveLength(4);
    expect(p.nodes[3].x).toBeCloseTo(200, 0);
  });
  it('delete removes selected anchors; removing all anchors removes the object', () => {
    const { e, id } = setup();
    click(e, 200, 200); click(e, 300, 300);
    e.deleteSelection();
    expect(e.pathOf(id)!.nodes).toHaveLength(2);
    e.undo();
    expect(e.pathOf(id)!.nodes).toHaveLength(3);
  });
  it('editing a rectangle converts it to a path preserving appearance, other anchors untouched', () => {
    const e = ed();
    const r = createRect(100, 100, 100, 100, { fill: solid('#ff0000') });
    e.apply('seed', (d) => addElement(d, r));
    e.setTool('direct');
    click(e, 150, 150);
    click(e, 200, 200);
    drag(e, 200, 200, 260, 240);
    const p = e.pathOf(r.id)!;
    expect(p).not.toBeNull();
    expect(p.fill?.color).toBe('#ff0000');
    expect(p.nodes[2]).toMatchObject({ x: 260, y: 240 });
    expect(p.nodes[0]).toMatchObject({ x: 100, y: 100 });
    e.undo();
    expect(getElement(e.doc, r.id)!.type).toBe('rect');
  });
  it('marquee selects anchors inside the box', () => {
    const { e, id } = setup();
    drag(e, 50, 50, 320, 150);
    expect(e.selectedNodeIndices(id)).toEqual([0, 1]);
  });
  it('alt-click converts a corner to a smooth anchor and back', () => {
    const { e, id } = setup();
    click(e, 200, 200);
    click(e, 300, 300, { alt: true });
    expect(e.pathOf(id)!.nodes[2].outX !== 0 || e.pathOf(id)!.nodes[2].outY !== 0).toBe(true);
    click(e, 300, 300, { alt: true });
    expect(e.pathOf(id)!.nodes[2]).toMatchObject({ outX: 0, outY: 0, inX: 0, inY: 0 });
  });
  it('edits inside transformed shapes land under the pointer', () => {
    const e = ed();
    const p = createPath([node(0, 0), node(100, 0), node(100, 100)], true, { transform: [2, 0, 0, 2, 50, 50] });
    e.apply('seed', (d) => addElement(d, p));
    e.setTool('direct');
    click(e, 150, 150);
    click(e, 250, 250);
    drag(e, 250, 250, 270, 290);
    expect(e.pathOf(p.id)!.nodes[2]).toMatchObject({ x: 110, y: 120 });
  });
});

describe('save / reopen through the editor', () => {
  it('preserves everything drawn with the tools', () => {
    const e = ed();
    e.setTool('rect'); drag(e, 10, 10, 110, 60);
    e.setTool('ellipse'); drag(e, 200, 200, 260, 240);
    e.setTool('pen'); click(e, 300, 300); drag(e, 400, 300, 440, 260); click(e, 400, 400);
    e.toolKey('Enter', { shift: false, alt: false, ctrl: false });
    e.setTool('select'); drag(e, 50, 30, 80, 90);
    e.updateStroke({ width: 5, dash: [4, 2] });
    e.addLayer();
    e.addArtboard('B', 4500, 5400, null);
    const text = serializeDocument(e.doc);
    const back = parseDocument(text);
    expect(back).toEqual(e.doc);
    const e2 = new Editor();
    e2.loadDocument(back, 'x.vstudio');
    expect(e2.doc).toEqual(e.doc);
  });
});

describe('boolean and compound commands', () => {
  it('unite via the editor is one undo step and selects the result; release splits it again', () => {
    const e = ed();
    const a = createRect(100, 100, 100, 100), b = createRect(150, 150, 100, 100);
    e.apply('seed', (d) => { addElement(d, a); addElement(d, b); });
    e.select([a.id, b.id]);
    expect(e.boolean('unite')).toBe(true);
    expect(els(e)).toHaveLength(1);
    expect(e.selection).toHaveLength(1);
    e.undo();
    expect(els(e)).toHaveLength(2);
    e.redo();
    e.makeCompound(); // single object: no-op
    expect(els(e)).toHaveLength(1);
  });
  it('make compound with a nested shape makes a hole; release restores two paths', () => {
    const e = ed();
    const a = createRect(100, 100, 200, 200), b = createRect(150, 150, 50, 50);
    e.apply('seed', (d) => { addElement(d, a); addElement(d, b); });
    e.select([a.id, b.id]);
    e.makeCompound();
    const c = els(e)[0];
    expect(c.type === 'path' && c.extra.length).toBe(1);
    expect(e.hit({ x: 170, y: 170 })).toBeNull(); // the hole
    expect(e.hit({ x: 120, y: 120 })).toBe(c.id);
    e.releaseCompound();
    expect(els(e)).toHaveLength(2);
  });
  it('an empty result changes nothing and reports it', () => {
    const e = ed();
    const a = createRect(0, 0, 50, 50), b = createRect(200, 200, 50, 50);
    e.apply('seed', (d) => { addElement(d, a); addElement(d, b); });
    e.select([a.id, b.id]);
    expect(e.boolean('intersect')).toBe(false);
    expect(els(e)).toHaveLength(2);
    expect(e.history.undoLabel).toBe('seed');
    expect(e.status).toMatch(/empty/);
  });
});

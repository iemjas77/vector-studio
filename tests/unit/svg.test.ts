import { describe, expect, it, beforeEach } from 'vitest';
import { createDocument, createEllipse, createPath, createRect, defaultStroke, groupElements, setIdGenerator, solid, worldBounds, addLayer, type Element } from '../../src/core/document';
import { exportSvg, importSvg, parsePathData, parseColor, parseTransform } from '../../src/core/io';
import { node, pathBounds } from '../../src/core/geometry/path';
import { apply } from '../../src/core/geometry/matrix';

beforeEach(() => { let i = 0; setIdGenerator(() => 'n' + ++i); });


describe('svg path parser', () => {
  it('parses absolute/relative lines, H/V and close', () => {
    const [s] = parsePathData('M10 10 l20 0 v20 H10 z');
    expect(s.closed).toBe(true);
    expect(s.nodes.map((n) => [n.x, n.y])).toEqual([[10, 10], [30, 10], [30, 30], [10, 30]]);
  });
  it('merges a duplicated closing point', () => {
    const [s] = parsePathData('M0 0L10 0L10 10L0 0Z');
    expect(s.nodes).toHaveLength(3);
  });
  it('converts cubic, smooth cubic, quadratic and smooth quadratic', () => {
    const [c] = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    expect(c.nodes).toHaveLength(3);
    expect(c.nodes[0]).toMatchObject({ outX: 0, outY: 10 });
    expect(c.nodes[2]).toMatchObject({ x: 20, y: 0, inX: 0, inY: -10 });
    expect(c.nodes[1]).toMatchObject({ x: 10, y: 0, outX: 0, outY: -10 }); // reflected
    const [q] = parsePathData('M0 0 Q50 100 100 0 T200 0');
    const b = pathBounds(q.nodes, false)!;
    expect(b.w).toBeCloseTo(200); expect(b.y).toBeCloseTo(-50, 5); expect(b.h).toBeCloseTo(100, 5);
  });
  it('arcs: semicircle bounds are exact within 0.1%', () => {
    const [s] = parsePathData('M0 50 A50 50 0 0 1 100 50');
    const b = pathBounds(s.nodes, false)!;
    expect(b.x).toBeCloseTo(0, 1); expect(b.w).toBeCloseTo(100, 1);
    expect(b.y).toBeCloseTo(0, 1); expect(b.h).toBeCloseTo(50, 1);
  });
  it('arcs with scaled-up radii, large-arc and sweep flags', () => {
    const [small] = parsePathData('M0 0 A10 10 0 0 1 100 0'); // radius too small → scaled to fit
    expect(pathBounds(small.nodes, false)!.h).toBeCloseTo(50, 0);
    const [large] = parsePathData('M0 0 A60 60 0 1 1 100 0');
    expect(pathBounds(large.nodes, false)!.h).toBeGreaterThan(60);
  });
  it('handles compact number syntax and several subpaths', () => {
    const subs = parsePathData('M.5.5L1-1-2 3zM10 10l5 5');
    expect(subs).toHaveLength(2);
    expect(subs[0].nodes.map((n) => [n.x, n.y])).toEqual([[0.5, 0.5], [1, -1], [-2, 3]]);
  });
  it('rejects malformed data', () => {
    expect(() => parsePathData('M10')).toThrow();
    expect(() => parsePathData('')).not.toThrow();
  });
  it('throws on garbage', () => {
    expect(() => parsePathData('M0 0 $ 5')).toThrow();
    expect(() => parsePathData('X1 2')).toThrow();
  });
});

describe('colours and transforms', () => {
  it('parses colour forms', () => {
    expect(parseColor('#f00')).toEqual({ color: '#ff0000', alpha: 1 });
    expect(parseColor('#00ff0080')!.alpha).toBeCloseTo(0.5, 2);
    expect(parseColor('rgb(255, 0, 128)')!.color).toBe('#ff0080');
    expect(parseColor('rgba(0,0,0,.25)')!.alpha).toBe(0.25);
    expect(parseColor('Navy')!.color).toBe('#000080');
    expect(parseColor('none')).toBeNull();
    expect(parseColor('banana')).toBeNull();
  });
  it('parses transform lists', () => {
    const m = parseTransform('translate(10 20) scale(2)');
    expect(apply(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 22 });
    const r = apply(parseTransform('rotate(90 10 10)'), { x: 20, y: 10 });
    expect(r.x).toBeCloseTo(10); expect(r.y).toBeCloseTo(20);
    expect(() => parseTransform('translate(a)')).toThrow();
  });
});

describe('svg import', () => {
  it('imports basic shapes with sizes and styles', () => {
    const { doc, warnings } = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
      <rect x="10" y="10" width="50" height="30" rx="4" fill="#ff0000" stroke="#00f" stroke-width="2"/>
      <circle cx="100" cy="50" r="20" style="fill:rgb(0,128,0);opacity:.5"/>
      <line x1="0" y1="0" x2="50" y2="50" stroke="black"/>
      <polygon points="0,0 10,0 10,10" fill="gray"/>
    </svg>`);
    expect(warnings).toEqual([]);
    expect(doc.artboards[0]).toMatchObject({ w: 200, h: 100 });
    const els = doc.layers[0].children;
    expect(els.map((e) => e.type)).toEqual(['rect', 'ellipse', 'path', 'path']);
    expect(els[0]).toMatchObject({ rx: 4, fill: { color: '#ff0000' }, stroke: { width: 2, paint: { color: '#0000ff' } } });
    expect(els[1]).toMatchObject({ opacity: 0.5, fill: { color: '#008000' } });
    expect(els[2]).toMatchObject({ fill: null, closed: false });
  });
  it('applies viewBox scaling and offset', () => {
    const { doc } = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="100 100 200 100"><rect x="100" y="100" width="200" height="100"/></svg>`);
    const b = worldBounds(doc, doc.layers[0].children[0].id)!;
    expect(b).toMatchObject({ x: 0, y: 0, w: 400, h: 200 });
  });
  it('inherits style from groups and applies group transforms', () => {
    const { doc } = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g fill="red" transform="translate(10,10)"><rect width="5" height="5"/></g></svg>`);
    const g = doc.layers[0].children[0];
    expect(g.type).toBe('group');
    if (g.type === 'group') expect(g.children[0]).toMatchObject({ fill: { color: '#ff0000' } });
    expect(worldBounds(doc, g.id)).toMatchObject({ x: 10, y: 10, w: 5, h: 5 });
  });
  it('reports unsupported features instead of silently dropping them', () => {
    const { warnings } = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text>hi</text><image href="x.png"/><path d="M0 0L5 0L5 5Z" fill-rule="evenodd"/></svg>`);
    expect(warnings.join('|')).toMatch(/<text>/);
    expect(warnings.join('|')).toMatch(/<image>/);
    expect(warnings.join('|')).toMatch(/evenodd/);
  });
  it('malformed path data skips only that path and warns', () => {
    const { doc, warnings } = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M0 0 $$"/><rect width="5" height="5"/></svg>`);
    expect(doc.layers[0].children).toHaveLength(1);
    expect(warnings.some((w) => /malformed/.test(w))).toBe(true);
  });
  it('rejects non-SVG and broken input', () => {
    expect(() => importSvg('hello')).toThrow();
    expect(() => importSvg('<html></html>')).toThrow(/Not an SVG/);
    expect(() => importSvg('<svg width="0" height="0"></svg>')).toThrow(/invalid size/);
    expect(() => importSvg('')).toThrow();
  });
  it('splits compound paths with a warning and keeps every sub-path', () => {
    const { doc, warnings } = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0H10V10Z M20 20H30V30Z"/></svg>`);
    const g = doc.layers[0].children[0];
    expect(g.type === 'group' && g.children.length).toBe(2);
    expect(warnings.length).toBe(1);
  });
  it('uses the first gradient stop as a flat fallback with a warning', () => {
    const { doc, warnings } = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="5" height="5" fill="url(#g)"/></svg>`);
    expect(doc.layers[0].children[0]).toMatchObject({ fill: { color: '#123456' } });
    expect(warnings[0]).toMatch(/Gradient/);
  });
});

describe('svg export → import round trip', () => {
  it('preserves geometry, paints, transforms, layers and artboard background', () => {
    const doc = createDocument('rt', 300, 200);
    doc.artboards[0].background = '#112233';
    const r = createRect(10, 20, 100, 50, { rx: 6, fill: solid('#ff8800', 0.5), stroke: { ...defaultStroke('#0000ff', 4), dash: [3, 1], cap: 'round', join: 'round' }, opacity: 0.8, name: 'Box & <Co>' });
    const e = createEllipse(150, 100, 30, 20, { transform: [0.8, 0.6, -0.6, 0.8, 5, 5] });
    const p = createPath([node(0, 0, 0, 0, 20, 30), node(80, 0, -20, 30, 0, 0), node(40, 60)], true, { fill: solid('#00ff00') });
    const open = createPath([node(0, 0), node(30, 30, -5, 0, 5, 0), node(60, 0)], false, { fill: null });
    doc.layers[0].children.push(r, e, p);
    addLayer(doc, 'Top');
    doc.layers[1].children.push(open);
    const g = groupElements(doc, [r.id, e.id])!;
    expect(g).toBeTruthy();
    const svg = exportSvg(doc);
    const { doc: back, warnings } = importSvg(svg, 'rt');
    expect(warnings).toEqual([]);
    expect(back.artboards[0]).toMatchObject({ w: 300, h: 200, background: '#112233' });
    expect(back.layers.map((l) => l.name)).toEqual(['Layer 1', 'Top']);
    // Compare while ignoring ids; element names survive via data-name.
    const norm = (els: Element[]): unknown => JSON.parse(JSON.stringify(els, (k, v) => (k === 'id' ? undefined : v)));
    expect(norm(back.layers[0].children)).toEqual(norm(doc.layers[0].children));
    expect(norm(back.layers[1].children)).toEqual(norm(doc.layers[1].children));
    expect(svg).toContain('Box &amp; &lt;Co&gt;');
  });
  it('skips hidden layers and elements on export', () => {
    const doc = createDocument();
    const a = createRect(0, 0, 10, 10, { visible: false }), b = createRect(0, 0, 20, 20);
    doc.layers[0].children.push(a, b);
    const svg = exportSvg(doc);
    expect(svg).not.toContain('width="10"');
    expect(svg).toContain('width="20"');
    doc.layers[0].visible = false;
    expect(exportSvg(doc)).not.toContain('width="20"');
  });
  it('transparent artboards export no background rect', () => {
    const doc = createDocument();
    doc.artboards[0].background = null;
    expect(exportSvg(doc)).not.toContain('artboard-background');
  });
});

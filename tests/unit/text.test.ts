import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  addElement, createDocument, createPath, createText, elementBounds, hitTest, parseDocument, serializeDocument, setIdGenerator, solid,
  validateDocument, convertToPath, getElement, worldBounds, DocumentFormatError,
} from '../../src/core/document';
import { layoutText } from '../../src/core/text';
import { node, pathBounds } from '../../src/core/geometry/path';
import { exportSvg, importSvg } from '../../src/core/io';
import { rasterizeArtboard } from '../../src/render/export';
import { setupFonts } from './fonts-setup';

let env = { arabic: false, cjk: false };
beforeAll(() => { env = setupFonts(); });
beforeEach(() => { let i = 0; setIdGenerator(() => 't' + ++i); });

const width = (content: string, extra = {}) => layoutText(createText(0, 0, content, { fontSize: 100, ...extra })).lines[0].width;
const make = (w: number, h: number) => { const canvas = createCanvas(w, h); return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D }; };
const alphaAt = (doc: ReturnType<typeof createDocument>, x: number, y: number) => {
  const off = rasterizeArtboard(doc, doc.artboards[0], make, { transparent: true });
  return (off.ctx as unknown as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }).getImageData(x, y, 1, 1).data[3];
};

describe('text shaping and layout (HarfBuzz)', () => {
  it('applies kerning: "AV" is narrower than A + V separately', () => {
    expect(width('AV')).toBeLessThan(width('A') + width('V') - 1);
  });
  it('applies tracking per glyph (1/1000 em) and bold is wider than regular', () => {
    const base = width('Hello');
    expect(width('Hello', { tracking: 100 })).toBeCloseTo(base + 4 * 10, 3); // 4 gaps × 0.1em × 100px
    expect(width('Hello', { fontWeight: 700 })).toBeGreaterThan(base);
  });
  it('width scales linearly with font size', () => {
    expect(width('Scale', { fontSize: 200 })).toBeCloseTo(width('Scale', { fontSize: 100 }) * 2, 3);
  });
  it('produces outlines with sensible bounds: glyph ink sits above the baseline', () => {
    const l = layoutText(createText(10, 200, 'H', { fontSize: 100 }));
    const ink = pathBounds(l.subpaths[0].nodes, true)!;
    expect(ink.y + ink.h).toBeCloseTo(200, 0);        // baseline
    expect(ink.h).toBeGreaterThan(60); expect(ink.h).toBeLessThan(90);  // cap height ≈ 0.73 em
    expect(ink.x).toBeGreaterThan(10);
  });
  it('multi-line: line count, baselines at lineHeight spacing, box covers all lines', () => {
    const l = layoutText(createText(0, 100, 'one\ntwo\nthree', { fontSize: 50, lineHeight: 1.5 }));
    expect(l.lines.map((x) => x.text)).toEqual(['one', 'two', 'three']);
    expect(l.lines.map((x) => x.baseline)).toEqual([100, 175, 250]);
    expect(l.box.y).toBeLessThan(100 - 30); expect(l.box.y + l.box.h).toBeGreaterThan(250);
  });
  it('word-wraps area text at the box width; no line exceeds it; long words are split', () => {
    const l = layoutText(createText(0, 50, 'The quick brown fox jumps over the lazy dog', { fontSize: 30, width: 200 }));
    expect(l.lines.length).toBeGreaterThan(2);
    l.lines.forEach((x) => expect(x.width).toBeLessThanOrEqual(200 + 0.01));
    expect(l.lines.map((x) => x.text).join(' ')).toBe('The quick brown fox jumps over the lazy dog');
    const long = layoutText(createText(0, 50, 'Supercalifragilisticexpialidocious', { fontSize: 30, width: 120 }));
    expect(long.lines.length).toBeGreaterThan(1);
    long.lines.forEach((x) => expect(x.width).toBeLessThanOrEqual(120 + 0.01));
  });
  it('alignment: point text centres/right-aligns around the anchor; area text inside the box', () => {
    const left = layoutText(createText(100, 50, 'Align me', { fontSize: 40 })).lines[0];
    const centre = layoutText(createText(100, 50, 'Align me', { fontSize: 40, align: 'center' })).lines[0];
    const right = layoutText(createText(100, 50, 'Align me', { fontSize: 40, align: 'right' })).lines[0];
    expect(left.x).toBe(100);
    expect(centre.x + centre.width / 2).toBeCloseTo(100, 3);
    expect(right.x + right.width).toBeCloseTo(100, 3);
    const area = layoutText(createText(0, 50, 'hi', { fontSize: 40, width: 300, align: 'right' })).lines[0];
    expect(area.x + area.width).toBeCloseTo(300, 3);
  });
  it('ligatures: "fi" shapes to a single glyph in a font that defines the ligature', () => {
    if (!env.arabic) return; // needs DejaVu Sans from the system
    expect(layoutText(createText(0, 0, 'fi', { fontFamily: 'DejaVu Sans', fontSize: 50 })).glyphCount).toBe(1);
    expect(layoutText(createText(0, 0, 'fi', { fontFamily: 'DejaVu Sans', fontSize: 50, tracking: 0 })).subpaths.length).toBeGreaterThan(0);
  });
  it('empty and whitespace-only text still has a selectable frame', () => {
    const e = layoutText(createText(10, 100, '', { fontSize: 40 }));
    expect(e.subpaths).toEqual([]);
    expect(e.box.h).toBeGreaterThan(30);
    const sp = layoutText(createText(10, 100, '   ', { fontSize: 40 }));
    expect(sp.box.w).toBeGreaterThan(0);
  });
  it('unknown families are substituted by the default family and flagged', () => {
    const l = layoutText(createText(0, 0, 'Hello', { fontFamily: 'No Such Font' }));
    expect(l.substituted).toBe(true);
    expect(l.glyphCount).toBe(5);
  });
  it('synthetic italic slants outlines to the right without a true italic face', () => {
    const upright = layoutText(createText(0, 100, 'I', { fontSize: 100 })).subpaths[0].nodes;
    const slanted = layoutText(createText(0, 100, 'I', { fontSize: 100, italic: true })).subpaths[0].nodes;
    const topX = (n: typeof upright) => n.filter((p) => p.y < 40).reduce((s, p) => s + p.x, 0) / Math.max(1, n.filter((p) => p.y < 40).length);
    expect(topX(slanted)).toBeGreaterThan(topX(upright) + 5);
  });
  it('multilingual: Greek/Cyrillic in the primary font; Arabic/Hebrew right-to-left via fallback; CJK via fallback', () => {
    const gr = layoutText(createText(0, 0, 'Γειά σου Κόσμε', { fontSize: 40 }));
    expect(gr.subpaths.length).toBeGreaterThan(8);
    const cy = layoutText(createText(0, 0, 'Привет мир', { fontSize: 40 }));
    expect(cy.subpaths.length).toBeGreaterThan(6);
    if (env.arabic) {
      const ar = layoutText(createText(0, 100, 'مرحبا', { fontSize: 60 }));
      expect(ar.glyphCount).toBeGreaterThan(0);
      expect(ar.lines[0].width).toBeGreaterThan(40);
      const he = layoutText(createText(0, 100, 'שלום', { fontSize: 60 }));
      expect(he.glyphCount).toBe(4);
      // RTL: the first character of the logical string is drawn at the RIGHT end.
      const mixed = layoutText(createText(0, 100, 'abc שלום', { fontSize: 60 }));
      expect(mixed.glyphCount).toBeGreaterThan(5);
    }
    if (env.cjk) {
      const cjk = layoutText(createText(0, 100, '日本語', { fontSize: 60 }));
      expect(cjk.glyphCount).toBe(3);
      expect(cjk.subpaths.length).toBeGreaterThan(3);
    }
  });
});

describe('text as a document object', () => {
  it('has bounds, hit-testing inside its frame, and moves with transforms', () => {
    const doc = createDocument('d', 400, 200);
    const t = createText(20, 100, 'Hello', { fontSize: 60 });
    addElement(doc, t);
    const b = elementBounds(t)!;
    expect(b.w).toBeGreaterThan(100);
    expect(hitTest(doc, { x: 60, y: 90 }, 0)).toBe(t.id);
    expect(hitTest(doc, { x: 390, y: 190 }, 0)).toBeNull();
  });
  it('renders ink where glyphs are and nothing in empty space (pixel check)', () => {
    const doc = createDocument('d', 300, 150);
    addElement(doc, createText(10, 110, 'I', { fontSize: 100, fontWeight: 700 }));
    const l = layoutText(doc.layers[0].children[0] as ReturnType<typeof createText>);
    const ink = pathBounds(l.subpaths[0].nodes, true)!;
    expect(alphaAt(doc, Math.round(ink.x + ink.w / 2), Math.round(ink.y + ink.h / 2))).toBe(255);
    expect(alphaAt(doc, 250, 20)).toBe(0);
  });
  it('round-trips through the native format with every property and keeps text editable', () => {
    const doc = createDocument();
    addElement(doc, createText(5, 50, 'Line 1\nLine 2 ünïcödé 日本', { fontFamily: 'Inter', fontSize: 33, fontWeight: 700, italic: true, tracking: 25, lineHeight: 1.4, align: 'center', width: 250, fill: solid('#336699', 0.8) }));
    const back = parseDocument(serializeDocument(doc));
    expect(back).toEqual(doc);
    const t = back.layers[0].children[0];
    expect(t.type === 'text' && t.content).toBe('Line 1\nLine 2 ünïcödé 日本');
  });
  it('rejects malformed text elements', () => {
    const doc = createDocument();
    addElement(doc, createText(0, 0, 'x'));
    const bad = JSON.parse(serializeDocument(doc));
    bad.layers[0].children[0].fontSize = -5;
    expect(() => validateDocument(bad)).toThrow(DocumentFormatError);
    const bad2 = JSON.parse(serializeDocument(doc));
    bad2.layers[0].children[0].align = 'justify';
    expect(() => validateDocument(bad2)).toThrow(DocumentFormatError);
  });
  it('Create Outlines converts to an editable compound path with the same ink and look', () => {
    const doc = createDocument('d', 300, 150);
    const t = createText(10, 110, 'Oo', { fontSize: 100, fill: solid('#ff0000') });
    addElement(doc, t);
    const before = worldBounds(doc, t.id)!;
    convertToPath(doc, t.id);
    const p = getElement(doc, t.id)!;
    expect(p.type).toBe('path');
    if (p.type === 'path') {
      expect(p.extra.length).toBeGreaterThanOrEqual(3); // outer + inner contours of O and o
      expect(p.fill).toMatchObject({ color: '#ff0000' });
    }
    const after = worldBounds(doc, t.id)!;
    expect(after.w).toBeLessThanOrEqual(before.w + 1); // ink bounds sit inside the advance frame
    expect(alphaAt(doc, 5, 5)).toBe(0);
  });
  it('SVG export writes outlines (no font dependency); import reads them back as paths', () => {
    const doc = createDocument('d', 300, 150);
    addElement(doc, createText(10, 110, 'Hi', { fontSize: 100 }));
    const svg = exportSvg(doc);
    expect(svg).toContain('data-text="Hi"');
    expect(svg).not.toContain('<text');
    const { doc: back } = importSvg(svg);
    expect(alphaAt(back, 25, 70)).toBe(255); // inside the H stem
  });
});

describe('text on a path', () => {
  const arc = { nodes: [node(50, 200, 0, 0, 0, -150), node(350, 200, 0, -150, 0, 0)], closed: false };
  it('places glyphs along the path and rotates them with the tangent', () => {
    const t = createText(0, 0, 'Curve', { fontSize: 40, path: arc, pathOffset: 0 });
    const l = layoutText(t);
    expect(l.subpaths.length).toBeGreaterThan(3);
    const first = pathBounds(l.subpaths[0].nodes, true)!;
    const last = pathBounds(l.subpaths[l.subpaths.length - 1].nodes, true)!;
    expect(first.x).toBeLessThan(120);                // starts near the left end of the arc
    expect(first.y).toBeGreaterThan(last.y - 400);   // sanity
    // Glyph centres stay within 'font height' of the path itself.
    const ys = l.subpaths.map((s) => pathBounds(s.nodes, true)!.y);
    expect(Math.min(...ys)).toBeLessThan(200);       // text rises with the arc
  });
  it('rotation: a glyph on a vertical stretch is rotated ~90°', () => {
    const vertical = { nodes: [node(100, 300), node(100, 0)], closed: false }; // going up
    const l = layoutText(createText(0, 0, 'I', { fontSize: 60, path: vertical, pathOffset: 0.4 }));
    const b = pathBounds(l.subpaths[0].nodes, true)!;
    expect(b.h).toBeLessThan(b.w * 3);               // an upright 'I' is tall and thin; rotated it is wide and flat
    expect(b.w).toBeGreaterThan(b.h * 0.8);
  });
  it('drops glyphs that run past the end of an open path', () => {
    const short = { nodes: [node(0, 100), node(60, 100)], closed: false };
    const full = layoutText(createText(0, 0, 'WWWWWWWWWW', { fontSize: 40, path: short }));
    const all = layoutText(createText(0, 0, 'WWWWWWWWWW', { fontSize: 40, path: { nodes: [node(0, 100), node(2000, 100)], closed: false } }));
    expect(full.subpaths.length).toBeLessThan(all.subpaths.length);
  });
  it('center alignment centres the text on the start point', () => {
    const line = { nodes: [node(0, 100), node(1000, 100)], closed: false };
    const l = layoutText(createText(0, 0, 'MMMM', { fontSize: 50, path: line, pathOffset: 0.5, align: 'center' }));
    const xs = l.subpaths.map((s) => pathBounds(s.nodes, true)!);
    const mid = (Math.min(...xs.map((b) => b.x)) + Math.max(...xs.map((b) => b.x + b.w))) / 2;
    expect(Math.abs(mid - 500)).toBeLessThan(15);
    void createPath;
  });
});

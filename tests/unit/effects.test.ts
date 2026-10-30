import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { addElement, createDocument, createRect, getElement, parseDocument, serializeDocument, setIdGenerator, solid, validateDocument, DocumentFormatError } from '../../src/core/document';
import { checkExport, exportSvg, importSvg } from '../../src/core/io';
import { Editor } from '../../src/editor/editor';
import { rasterizeArtboard } from '../../src/render/export';

beforeEach(() => { let i = 0; setIdGenerator(() => 'f' + ++i); });
const make = (w: number, h: number) => { const canvas = createCanvas(w, h); return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D }; };
function px(doc: ReturnType<typeof createDocument>, x: number, y: number): number[] {
  const off = rasterizeArtboard(doc, doc.artboards[0], make, {});
  return [...(off.ctx as unknown as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }).getImageData(x, y, 1, 1).data];
}
const base = () => { const d = createDocument('d', 200, 100); d.artboards[0].background = '#ffffff'; return d; };

describe('blend modes', () => {
  it('multiply, screen and difference mix with the backdrop exactly', () => {
    for (const [mode, expected] of [['multiply', [255, 0, 0]], ['screen', [255, 255, 0]], ['difference', [0, 255, 0]]] as const) {
      const doc = base();
      addElement(doc, createRect(0, 0, 200, 100, { fill: solid('#ffff00'), stroke: null }));
      addElement(doc, createRect(50, 25, 100, 50, { fill: solid('#ff0000'), stroke: null, blend: mode }));
      // yellow ⊗ red: multiply = red, screen = yellow, difference = |ff-ff|,|ff-00|,|00-00| = green
      expect(px(doc, 100, 50).slice(0, 3), mode).toEqual(expected);
      expect(px(doc, 10, 10).slice(0, 3)).toEqual([255, 255, 0]);
    }
  });
  it('normal is the default and does not force an offscreen layer', () => {
    const doc = base();
    addElement(doc, createRect(0, 0, 50, 50, { fill: solid('#123456'), stroke: null, blend: 'normal' }));
    expect(px(doc, 10, 10).slice(0, 3)).toEqual([0x12, 0x34, 0x56]);
  });
});

describe('live effects', () => {
  it('drop shadow appears offset behind the object and the object stays crisp', () => {
    const doc = base();
    addElement(doc, createRect(40, 20, 40, 40, { fill: solid('#ff0000'), stroke: null, effects: [{ type: 'dropShadow', dx: 30, dy: 0, blur: 0, color: '#000000', alpha: 1 }] }));
    expect(px(doc, 60, 40).slice(0, 3)).toEqual([255, 0, 0]);          // object
    expect(px(doc, 100, 40).slice(0, 3)).toEqual([0, 0, 0]);           // shadow, 30 units to the right of the object's edge region
    expect(px(doc, 130, 40).slice(0, 3)).toEqual([255, 255, 255]);     // beyond the shadow
    expect(px(doc, 60, 80).slice(0, 3)).toEqual([255, 255, 255]);
  });
  it('blur softens edges; the effect radius scales with the artwork', () => {
    const doc = base();
    addElement(doc, createRect(80, 30, 40, 40, { fill: solid('#000000'), stroke: null, effects: [{ type: 'blur', radius: 6 }] }));
    const edge = px(doc, 80, 50)[0];
    expect(edge).toBeGreaterThan(60); expect(edge).toBeLessThan(200);    // half-way grey on the edge
    expect(px(doc, 100, 50)[0]).toBeLessThan(10);                         // centre still dark
    const off = rasterizeArtboard(doc, doc.artboards[0], make, { scale: 2 });
    const d = (off.ctx as unknown as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }).getImageData(160, 100, 1, 1).data[0];
    expect(Math.abs(d - edge)).toBeLessThan(40);                          // same softness at 2× (radius is in document units)
  });
  it('outer glow spreads colour around the object', () => {
    const doc = base();
    addElement(doc, createRect(80, 30, 40, 40, { fill: solid('#000000'), stroke: null, effects: [{ type: 'outerGlow', blur: 16, color: '#ff0000', alpha: 1 }] }));
    const near = px(doc, 76, 50);
    expect(near[0]).toBeGreaterThan(200); expect(near[1]).toBeLessThan(180);   // reddish just outside the edge
    expect(px(doc, 2, 2).slice(0, 3)).toEqual([255, 255, 255]);
  });
  it('effects on groups apply to the group as a whole', async () => {
    const { groupElements } = await import('../../src/core/document');
    const doc = base();
    const a = createRect(40, 20, 30, 30, { fill: solid('#ff0000'), stroke: null }), b = createRect(60, 40, 30, 30, { fill: solid('#ff0000'), stroke: null });
    addElement(doc, a); addElement(doc, b);
    const gid = groupElements(doc, [a.id, b.id])!;
    const g = getElement(doc, gid)!; g.effects = [{ type: 'dropShadow', dx: 60, dy: 0, blur: 0, color: '#0000ff', alpha: 1 }];
    expect(px(doc, 140, 55).slice(0, 3)).toEqual([0, 0, 255]);
  });
});

describe('editing, storage, export', () => {
  it('editor commands add/update/remove/clear effects and blend modes with undo', () => {
    const e = new Editor(base());
    const r = createRect(10, 10, 50, 50);
    e.apply('seed', (d) => addElement(d, r));
    e.select([r.id]);
    e.addEffect({ type: 'blur', radius: 3 });
    e.addEffect({ type: 'dropShadow', dx: 2, dy: 2, blur: 4, color: '#000000', alpha: 0.5 });
    e.updateEffect(0, { type: 'blur', radius: 9 });
    expect(getElement(e.doc, r.id)!.effects).toEqual([{ type: 'blur', radius: 9 }, { type: 'dropShadow', dx: 2, dy: 2, blur: 4, color: '#000000', alpha: 0.5 }]);
    e.removeEffect(0);
    expect(getElement(e.doc, r.id)!.effects).toHaveLength(1);
    e.setBlend('multiply');
    expect(getElement(e.doc, r.id)!.blend).toBe('multiply');
    e.setBlend('normal');
    expect(getElement(e.doc, r.id)!.blend).toBeUndefined();         // normal is stored as absent
    e.clearEffects();
    expect(getElement(e.doc, r.id)!.effects).toBeUndefined();
    e.undo(); e.undo();
    expect(getElement(e.doc, r.id)!.blend).toBe('multiply');
  });
  it('effects and blend modes survive save/reopen; invalid values are rejected', () => {
    const doc = base();
    addElement(doc, createRect(0, 0, 10, 10, { blend: 'overlay', effects: [{ type: 'outerGlow', blur: 5, color: '#00ff00', alpha: 0.5 }, { type: 'blur', radius: 2 }] }));
    expect(parseDocument(serializeDocument(doc))).toEqual(doc);
    const bad = JSON.parse(serializeDocument(doc)); bad.layers[0].children[0].blend = 'sparkle';
    expect(() => validateDocument(bad)).toThrow(DocumentFormatError);
    const bad2 = JSON.parse(serializeDocument(doc)); bad2.layers[0].children[0].effects[0].alpha = 7;
    expect(() => validateDocument(bad2)).toThrow(DocumentFormatError);
  });
  it('SVG export writes filters and mix-blend-mode; import keeps blend and warns about filters', () => {
    const doc = base();
    addElement(doc, createRect(10, 10, 50, 50, { blend: 'multiply', effects: [{ type: 'dropShadow', dx: 4, dy: 4, blur: 6, color: '#000000', alpha: 0.5 }, { type: 'blur', radius: 2 }] }));
    const svg = exportSvg(doc);
    expect(svg).toContain('<filter');
    expect(svg).toContain('feGaussianBlur');
    expect(svg).toContain('mix-blend-mode:multiply');
    const { doc: back, warnings } = importSvg(svg);
    expect(back.layers[0].children[0].blend).toBe('multiply');
    expect(warnings.join('|')).toMatch(/filters are not imported/);
  });
  it('export pre-flight warns that PDF cannot hold effects, and mentions SVG filters/blend', () => {
    const doc = base();
    addElement(doc, createRect(10, 10, 50, 50, { blend: 'screen', effects: [{ type: 'blur', radius: 2 }] }));
    const text = (f: 'pdf' | 'svg' | 'png') => checkExport(doc, doc.artboards[0], { format: f, transparent: false }).map((i) => i.text).join('|');
    expect(text('pdf')).toMatch(/PDF cannot represent them/);
    expect(text('svg')).toMatch(/SVG filters/);
    expect(text('svg')).toMatch(/mix-blend-mode/);
    expect(text('png')).not.toMatch(/PDF cannot/);
  });
});

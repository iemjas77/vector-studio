import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PNG } from 'pngjs';
import { addElement, createArtboard, createDocument, createRect, setIdGenerator, solid } from '../../src/core/document';
import { checkExport, physicalSize, readJpegPpi, readPngPpi, setJpegPpi, setPngPpi } from '../../src/core/io';
import { rasterizeArtboard } from '../../src/render/export';

beforeEach(() => { let i = 0; setIdGenerator(() => 'x' + ++i); });
const make = (w: number, h: number) => { const canvas = createCanvas(w, h); return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D }; };
type Cnv = { toBuffer(t: 'image/png'): Buffer; toBuffer(t: 'image/jpeg', q?: number): Buffer };

describe('PNG / JPEG resolution metadata', () => {
  it('writes a valid pHYs chunk that readers accept, replacing an existing one', () => {
    const doc = createDocument('d', 40, 30);
    const off = rasterizeArtboard(doc, doc.artboards[0], make, {});
    const raw = new Uint8Array((off.canvas as unknown as Cnv).toBuffer('image/png'));
    const withPpi = setPngPpi(raw, 300);
    expect(readPngPpi(withPpi)).toBe(300);
    const decoded = PNG.sync.read(Buffer.from(withPpi));       // still a valid PNG (CRCs checked by pngjs)
    expect(decoded.width).toBe(40); expect(decoded.height).toBe(30);
    expect(readPngPpi(setPngPpi(withPpi, 72))).toBe(72);
    expect(() => setPngPpi(new Uint8Array(40), 300)).toThrow(/Not a PNG/);
  });
  it('sets JFIF density when present and leaves other data alone', () => {
    const doc = createDocument('d', 40, 30);
    const off = rasterizeArtboard(doc, doc.artboards[0], make, { flatten: '#ffffff' });
    const jpg = new Uint8Array((off.canvas as unknown as Cnv).toBuffer('image/jpeg', 90));
    expect(jpg[0]).toBe(0xff); expect(jpg[1]).toBe(0xd8);
    const out = setJpegPpi(jpg, 300);
    expect(readJpegPpi(out)).toBe(300);
    expect(setJpegPpi(new Uint8Array([1, 2, 3]), 300)).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('JPEG export', () => {
  it('flattens transparency onto the chosen colour and keeps colours close', async () => {
    const doc = createDocument('d', 64, 64);
    doc.artboards[0].background = null;
    addElement(doc, createRect(0, 0, 32, 64, { fill: solid('#ff0000'), stroke: null }));
    const off = rasterizeArtboard(doc, doc.artboards[0], make, { flatten: '#ffffff' });
    const img = await loadImage((off.canvas as unknown as Cnv).toBuffer('image/jpeg', 95));
    expect(img.width).toBe(64); expect(img.height).toBe(64);
    const c = createCanvas(64, 64); const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data];
    expect(px(10, 32)[0]).toBeGreaterThan(240); expect(px(10, 32)[1]).toBeLessThan(25);
    expect(px(55, 32).slice(0, 3).every((v) => v > 240)).toBe(true);
    expect(px(55, 32)[3]).toBe(255);
  });
});

describe('export pre-flight checks', () => {
  it('reports empty artboards, clipped and translucent content, JPEG/PDF notes', () => {
    const doc = createDocument('d', 100, 100);
    doc.artboards[0].background = null;
    const opts = { format: 'png' as const, transparent: true };
    expect(checkExport(doc, doc.artboards[0], opts).map((i) => i.text).join()).toMatch(/no visible content/);
    addElement(doc, createRect(-20, 10, 50, 50, { fill: solid('#000000', 0.5) }));
    addElement(doc, createRect(10, 10, 20, 20, { visible: false }));
    const t = checkExport(doc, doc.artboards[0], opts).map((i) => i.text).join('|');
    expect(t).toMatch(/1 object extends beyond/);
    expect(t).toMatch(/transparency/);
    expect(checkExport(doc, doc.artboards[0], { format: 'jpeg', transparent: true }).map((i) => i.text).join()).toMatch(/JPEG has no transparency/);
    expect(checkExport(doc, doc.artboards[0], { format: 'pdf', transparent: false }).map((i) => i.text).join()).toMatch(/PDF export is vector/);
    const other = createArtboard('B', 500, 500, 50, 50, null);
    expect(checkExport({ ...doc, artboards: [doc.artboards[0], other] }, other, opts).map((i) => i.text).join()).toMatch(/no visible content/);
  });
  it('computes physical print size', () => {
    const s = physicalSize(4500, 5400, 300);
    expect(s.inW).toBe(15); expect(s.inH).toBe(18);
    expect(s.cmW).toBeCloseTo(38.1);
  });
});

describe('raster bleed', () => {
  it('grows the output by the bleed and includes content outside the artboard', () => {
    const doc = createDocument('d', 100, 100);
    doc.artboards[0].background = null;
    addElement(doc, createRect(-10, 40, 120, 20, { fill: solid('#ff0000'), stroke: null }));
    const off = rasterizeArtboard(doc, doc.artboards[0], make, { bleed: 10 });
    const c = off.canvas as unknown as { width: number; height: number };
    expect([c.width, c.height]).toEqual([120, 120]);
    const d = (off.ctx as unknown as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }).getImageData(0, 0, 120, 120).data;
    const a = (x: number, y: number) => d[(120 * y + x) * 4 + 3];
    expect(a(2, 60)).toBe(255);   // bar reaches into the left bleed
    expect(a(117, 60)).toBe(255); // and the right bleed
    expect(a(2, 5)).toBe(0);
  });
});

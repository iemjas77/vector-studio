import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { PNG } from 'pngjs';
import {
  addElement, createArtboard, createDocument, createEllipse, createPath, createRect, defaultStroke, groupElements, makeClippingMask,
  setIdGenerator, solid, type VDocument,
} from '../../src/core/document';
import { exportPdf } from '../../src/core/io';
import { node } from '../../src/core/geometry/path';
import { createText } from '../../src/core/document';
import { setupFonts } from './fonts-setup';
import { rasterizeArtboard } from '../../src/render/export';

const hasPoppler = spawnSync('pdftoppm', ['-v']).status !== null && spawnSync('pdftoppm', ['-v']).error === undefined;
const d = hasPoppler ? describe : describe.skip;

beforeEach(() => { let i = 0; setIdGenerator(() => 'p' + ++i); });

const make = (w: number, h: number) => { const canvas = createCanvas(w, h); return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D }; };

/** Rasterise the PDF with poppler at 72 dpi and our own renderer; return the fraction of clearly different pixels. */
function compare(doc: VDocument): { diff: number; pdf: PNG; ours: PNG } {
  const dir = mkdtempSync(join(tmpdir(), 'vs-pdf-'));
  writeFileSync(join(dir, 'a.pdf'), exportPdf(doc, [doc.artboards[0]]));
  execFileSync('pdftoppm', ['-png', '-r', '72', '-singlefile', join(dir, 'a.pdf'), join(dir, 'out')]);
  const pdf = PNG.sync.read(readFileSync(join(dir, 'out.png')));
  const off = rasterizeArtboard(doc, doc.artboards[0], make, {});
  const ours = PNG.sync.read((off.canvas as unknown as { toBuffer(t: 'image/png'): Buffer }).toBuffer('image/png'));
  expect(pdf.width).toBe(ours.width); expect(pdf.height).toBe(ours.height);
  let bad = 0;
  for (let i = 0; i < pdf.data.length; i += 4) {
    const dd = Math.abs(pdf.data[i] - ours.data[i]) + Math.abs(pdf.data[i + 1] - ours.data[i + 1]) + Math.abs(pdf.data[i + 2] - ours.data[i + 2]);
    if (dd > 60) bad++;
  }
  return { diff: bad / (pdf.width * pdf.height), pdf, ours };
}

d('PDF export (verified by rasterising with poppler)', () => {
  it('is a structurally valid multi-page PDF with correct page sizes', () => {
    const doc = createDocument('d', 300, 200);
    doc.artboards.push(createArtboard('B', 400, 0, 100, 150));
    const dir = mkdtempSync(join(tmpdir(), 'vs-pdf-'));
    writeFileSync(join(dir, 'a.pdf'), exportPdf(doc));
    const info = execFileSync('pdfinfo', ['-f', '1', '-l', '2', join(dir, 'a.pdf')]).toString();
    expect(info).toMatch(/Pages:\s+2/);
    expect(info).toMatch(/Page\s+1 size:\s+300 x 200 pts/);
    expect(info).toMatch(/Page\s+2 size:\s+100 x 150 pts/);
  });
  it('shapes, strokes, curves, transforms and groups match the canvas renderer', () => {
    const doc = createDocument('d', 300, 300);
    addElement(doc, createRect(20, 20, 100, 60, { fill: solid('#ff0000'), stroke: { ...defaultStroke('#0000ff', 8), join: 'round' } }));
    addElement(doc, createEllipse(220, 70, 50, 30, { fill: solid('#00aa00', 0.5), stroke: null }));
    addElement(doc, createPath([node(20, 200), node(100, 120, -30, 40, 40, -40), node(180, 200)], false, { fill: null, stroke: { ...defaultStroke('#000000', 6), cap: 'round', dash: [12, 8] } }));
    const r = createRect(0, 0, 60, 60, { fill: solid('#ff8800'), stroke: null, transform: [0.8, 0.6, -0.6, 0.8, 230, 180] });
    addElement(doc, r);
    const r2 = createRect(200, 250, 40, 30, { fill: solid('#8800ff'), stroke: null, opacity: 0.6 });
    addElement(doc, r2);
    groupElements(doc, [r.id, r2.id]);
    const { diff } = compare(doc);
    expect(diff).toBeLessThan(0.01);
  });
  it('compound paths (even-odd hole) and rounded rectangles', () => {
    const doc = createDocument('d', 200, 200);
    addElement(doc, createPath([node(20, 20), node(180, 20), node(180, 180), node(20, 180)], true, { extra: [{ nodes: [node(60, 60), node(140, 60), node(140, 140), node(60, 140)], closed: true }], fillRule: 'evenodd', fill: solid('#112233'), stroke: null }));
    addElement(doc, createRect(80, 80, 40, 40, { rx: 12, fill: solid('#ffcc00'), stroke: null }));
    const { diff, pdf } = compare(doc);
    expect(diff).toBeLessThan(0.02); // differences are anti-aliasing on long straight edges (poppler vs canvas)
    const px = (x: number, y: number) => [...pdf.data.slice((pdf.width * y + x) * 4, (pdf.width * y + x) * 4 + 3)];
    expect(px(40, 100)).toEqual([0x11, 0x22, 0x33]);
    expect(px(70, 70)).toEqual([255, 255, 255]); // the hole shows the white page
  });
  it('linear and radial gradients (multi-stop) and clipping masks', () => {
    const doc = createDocument('d', 300, 200);
    addElement(doc, createRect(10, 10, 130, 80, { stroke: null, fill: { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: '#ff0000', alpha: 1 }, { offset: 0.5, color: '#00ff00', alpha: 1 }, { offset: 1, color: '#0000ff', alpha: 1 }] } }));
    addElement(doc, createEllipse(220, 50, 60, 40, { stroke: null, fill: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#ffffff', alpha: 1 }, { offset: 1, color: '#000000', alpha: 1 }] } }));
    const art = createRect(0, 100, 300, 100, { fill: solid('#cc0000'), stroke: null });
    const mask = createEllipse(100, 150, 60, 40, { fill: solid('#000000'), stroke: null });
    addElement(doc, art); addElement(doc, mask);
    makeClippingMask(doc, [art.id, mask.id]);
    const { diff, pdf } = compare(doc);
    expect(diff).toBeLessThan(0.015);
    const px = (x: number, y: number) => [...pdf.data.slice((pdf.width * y + x) * 4, (pdf.width * y + x) * 4 + 3)];
    expect(px(100, 150)).toEqual([0xcc, 0, 0]);
    expect(px(250, 190)).toEqual([255, 255, 255]);   // outside the mask
  });
  it('text is exported as vector outlines that match the canvas renderer', () => {
    setupFonts();
    const doc = createDocument('d', 400, 160);
    addElement(doc, createText(20, 110, 'Vector Studio', { fontSize: 64, fontWeight: 700, fill: solid('#224488') }));
    const { diff } = compare(doc);
    expect(diff).toBeLessThan(0.02);
  });
  it('transparent artboards leave the page white-free of background fills; opaque ones paint it', () => {
    const doc = createDocument('d', 50, 50);
    doc.artboards[0].background = '#336699';
    const { pdf } = compare(doc);
    expect([...pdf.data.slice(0, 3)]).toEqual([0x33, 0x66, 0x99]);
  });
  it('1 unit equals 1/ppi inch', () => {
    const doc = createDocument('d', 300, 150);
    doc.ppi = 300;
    const dir = mkdtempSync(join(tmpdir(), 'vs-pdf-'));
    writeFileSync(join(dir, 'a.pdf'), exportPdf(doc));
    expect(execFileSync('pdfinfo', [join(dir, 'a.pdf')]).toString()).toMatch(/Page size:\s+72 x 36 pts/);
  });
});

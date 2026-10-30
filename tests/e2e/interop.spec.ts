import { expect, test } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import { PNG } from 'pngjs';
import {
  addElement, createDocument, createEllipse, createPath, createRect, createText, defaultStroke, groupElements, makeClippingMask, setIdGenerator, solid,
} from '../../src/core/document';
import { node } from '../../src/core/geometry/path';
import { exportSvg } from '../../src/core/io';
import { fonts } from '../../src/core/text';
import { rasterizeArtboard } from '../../src/render/export';
import { readFileSync } from 'node:fs';

/**
 * Interoperability check: our SVG is drawn by Chromium's own SVG engine (an independent implementation) and compared
 * pixel-by-pixel with our canvas renderer.
 */
test('exported SVG renders the same in Chromium as in our renderer', async ({ page }) => {
  let n = 0; setIdGenerator(() => 'i' + ++n);
  const root = new URL('../../src/assets/fonts/', import.meta.url);
  fonts.register({ family: 'Inter', weight: 700, italic: false }, new Uint8Array(readFileSync(new URL('Inter-Bold.otf', root))));
  fonts.register({ family: 'Inter', weight: 400, italic: false }, new Uint8Array(readFileSync(new URL('Inter-Regular.otf', root))));
  const doc = createDocument('interop', 320, 240);
  doc.artboards[0].background = '#fffbe6';
  addElement(doc, createRect(20, 20, 120, 70, { rx: 14, fill: solid('#d03030'), stroke: { ...defaultStroke('#202020', 6), join: 'round', dash: [10, 6] } }));
  addElement(doc, createEllipse(230, 60, 60, 36, { fill: { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ offset: 0, color: '#ffcc00', alpha: 1 }, { offset: 1, color: '#2255ff', alpha: 1 }] }, stroke: null }));
  addElement(doc, createPath([node(20, 200), node(90, 110, -30, 30, 30, -30), node(160, 200)], false, { fill: null, stroke: { ...defaultStroke('#008800', 8), cap: 'round' } }));
  addElement(doc, createPath([node(200, 120), node(300, 120), node(300, 220), node(200, 220)], true, { extra: [{ nodes: [node(230, 150), node(230, 190), node(270, 190), node(270, 150)], closed: true }], fillRule: 'evenodd', fill: solid('#6030a0'), stroke: null }));
  const art = createRect(170, 150, 20, 80, { fill: solid('#009999'), stroke: null }), mask = createEllipse(180, 190, 10, 30, { fill: solid('#000000'), stroke: null });
  addElement(doc, art); addElement(doc, mask); makeClippingMask(doc, [art.id, mask.id]);
  const r2 = createRect(100, 140, 30, 30, { fill: solid('#0044aa'), stroke: null, transform: [0.9, 0.4, -0.4, 0.9, 10, 0], opacity: 0.6 });
  addElement(doc, r2); groupElements(doc, [r2.id]);
  addElement(doc, createText(30, 150, 'Hi', { fontSize: 40, fontWeight: 700, fill: solid('#111111') }));

  const svg = exportSvg(doc);
  const off = rasterizeArtboard(doc, doc.artboards[0], (w, h) => { const c = createCanvas(w, h); return { canvas: c, ctx: c.getContext('2d') as unknown as CanvasRenderingContext2D }; }, {});
  const ours = PNG.sync.read((off.canvas as unknown as { toBuffer(t: 'image/png'): Buffer }).toBuffer('image/png'));

  await page.setContent('<html><body style="margin:0"><canvas id="c" width="320" height="240"></canvas></body></html>');
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const rgba: number[] = await page.evaluate(async (url) => {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Chromium could not load the exported SVG')); img.src = url; });
    const c = document.getElementById('c') as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, 320, 240).data);
  }, dataUrl);

  let bad = 0;
  for (let i = 0; i < ours.data.length; i += 4) {
    const d = Math.abs(ours.data[i] - rgba[i]) + Math.abs(ours.data[i + 1] - rgba[i + 1]) + Math.abs(ours.data[i + 2] - rgba[i + 2]) + Math.abs(ours.data[i + 3] - rgba[i + 3]);
    if (d > 80) bad++;
  }
  const frac = bad / (320 * 240);
  expect(frac, `fraction of clearly different pixels: ${frac}`).toBeLessThan(0.01);
  // spot checks that the comparison is meaningful (not two blank images)
  const at = (arr: ArrayLike<number>, x: number, y: number) => [arr[(320 * y + x) * 4], arr[(320 * y + x) * 4 + 1], arr[(320 * y + x) * 4 + 2]];
  expect(at(rgba, 60, 55)).toEqual([0xd0, 0x30, 0x30]);
  expect(at(rgba, 250, 170)).toEqual([0xff, 0xfb, 0xe6]);         // the evenodd hole shows the page background
  expect(at(rgba, 215, 135)).toEqual([0x60, 0x30, 0xa0]);
});

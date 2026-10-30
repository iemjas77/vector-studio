import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { addElement, createDocument, createEllipse, createPath, createRect, solid, hitTest, serializeDocument, parseDocument } from '../../src/core/document';
import { node } from '../../src/core/geometry/path';
import { renderView } from '../../src/render/canvas2d';

function bigDoc(n: number) {
  const doc = createDocument('big', 4500, 5400);
  const cols = 100;
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * 45, y = Math.floor(i / cols) * 45;
    const k = i % 3;
    addElement(doc, k === 0 ? createRect(x, y, 40, 40, { fill: solid('#336699') })
      : k === 1 ? createEllipse(x + 20, y + 20, 20, 20, { fill: solid('#993366') })
      : createPath([node(x, y), node(x + 40, y, 0, 0, 10, 10), node(x + 20, y + 40, 10, -10, 0, 0)], true, { fill: solid('#669933') }));
  }
  return doc;
}

describe('performance budgets (generous; regressions of >10x fail)', () => {
  it('renders 10k mixed objects on a 1920×1080 view, and culling makes zoomed-in views much cheaper', () => {
    const doc = bigDoc(10000);
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    const t0 = performance.now();
    renderView(ctx, doc, { zoom: 0.2, panX: 0, panY: 0, width: 1920, height: 1080, dpr: 1 });
    const full = performance.now() - t0;
    const t1 = performance.now();
    renderView(ctx, doc, { zoom: 2, panX: 0, panY: 0, width: 1920, height: 1080, dpr: 1 });
    const zoomed = performance.now() - t1;
    console.log(`[perf] render 10k objects: overview ${full.toFixed(0)} ms, zoomed-in (culled) ${zoomed.toFixed(0)} ms`);
    expect(full).toBeLessThan(5000);
    expect(zoomed).toBeLessThan(full);
  });
  it('hit-tests and serialises 10k objects quickly', () => {
    const doc = bigDoc(10000);
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) hitTest(doc, { x: 2000 + i, y: 2000 }, 2);
    const hit = (performance.now() - t0) / 50;
    const t1 = performance.now();
    const back = parseDocument(serializeDocument(doc));
    const io = performance.now() - t1;
    console.log(`[perf] hit-test ${hit.toFixed(2)} ms each, serialise+parse 10k objects ${io.toFixed(0)} ms`);
    expect(back.layers[0].children).toHaveLength(10000);
    expect(hit).toBeLessThan(50);
    expect(io).toBeLessThan(3000);
  });
});

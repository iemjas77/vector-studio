import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { addElement, createArtboard, createDocument, createRect, serializeDocument, setIdGenerator, solid } from '../../src/core/document';
import { readJpegPpi, readPngPpi } from '../../src/core/io';
import { runBatch } from '../../cli/batch';

beforeEach(() => { let i = 0; setIdGenerator(() => 'z' + ++i); });

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'vs-batch-'));
  const doc = createDocument('Design', 400, 400);
  doc.ppi = 300;
  doc.artboards[0].name = 'Front';
  doc.artboards[0].background = null;
  doc.artboards.push(createArtboard('Back', 500, 0, 200, 200, '#ffffff'));
  addElement(doc, createRect(100, 100, 200, 200, { fill: solid('#ff0000'), stroke: null }));
  addElement(doc, createRect(0, 0, 2, 2, { fill: solid('#00ff00'), visible: false }));
  const file = join(dir, 'design.vstudio');
  writeFileSync(file, serializeDocument(doc));
  return { dir, file };
}

describe('headless batch runner (same code path as the CLI)', () => {
  it('exports every artboard as PNG with transparency and the document ppi', async () => {
    const { dir, file } = project();
    const out = await runBatch({ inputs: [file], outDir: join(dir, 'out'), format: 'png' });
    expect(readdirSync(join(dir, 'out')).sort()).toEqual(['design-Back.png', 'design-Front.png']);
    const bytes = readFileSync(out.find((f) => f.endsWith('Front.png'))!);
    const png = PNG.sync.read(bytes);
    expect([png.width, png.height]).toEqual([400, 400]);
    expect(png.data[3]).toBe(0);
    expect(readPngPpi(new Uint8Array(bytes))).toBe(300);
  });
  it('single artboard, JPEG with quality and ppi, PDF, SVG', async () => {
    const { dir, file } = project();
    const jpg = await runBatch({ inputs: [file], outDir: join(dir, 'j'), format: 'jpeg', artboard: 'Front', ppi: 150, quality: 0.8 });
    expect(jpg).toHaveLength(1);
    const jb = new Uint8Array(readFileSync(jpg[0]));
    expect([jb[0], jb[1]]).toEqual([0xff, 0xd8]);
    expect(readJpegPpi(jb)).toBe(150);
    const pdf = await runBatch({ inputs: [file], outDir: join(dir, 'p'), format: 'pdf' });
    expect(readFileSync(pdf[0]).subarray(0, 5).toString()).toBe('%PDF-');
    const svg = await runBatch({ inputs: [file], outDir: join(dir, 's'), format: 'svg', artboard: 'Back' });
    expect(readFileSync(svg[0], 'utf8')).toContain('viewBox="500 0 200 200"');
  });
  it('actions + sizes: cleanup removes the hidden square, content is re-targeted to each size', async () => {
    const { dir, file } = project();
    const actions = join(dir, 'a.json');
    writeFileSync(actions, JSON.stringify([{ type: 'cleanup' }, { type: 'replaceColor', from: '#ff0000', to: '#0000ff' }]));
    const out = await runBatch({ inputs: [file], outDir: join(dir, 'o'), format: 'png', artboard: 'Front', sizes: '200x200 half, 100x400 tall', actionsFile: actions, transparent: true });
    expect(out.map((f) => f.split(/[\\/]/).pop()).sort()).toEqual(['design-Front-half.png', 'design-Front-tall.png']);
    const half = PNG.sync.read(readFileSync(out.find((f) => f.endsWith('half.png'))!));
    expect([half.width, half.height]).toEqual([200, 200]);
    const px = (x: number, y: number) => [...half.data.slice((half.width * y + x) * 4, (half.width * y + x) * 4 + 4)];
    expect(px(100, 100)).toEqual([0, 0, 255, 255]);     // recoloured square, scaled ×0.5, still centred
    expect(px(10, 10)[3]).toBe(0);
    const tall = PNG.sync.read(readFileSync(out.find((f) => f.endsWith('tall.png'))!));
    expect([tall.width, tall.height]).toEqual([100, 400]);
  });
  it('fails loudly on bad input instead of skipping', async () => {
    const { dir, file } = project();
    await expect(runBatch({ inputs: [], outDir: dir, format: 'png' })).rejects.toThrow(/No input/);
    await expect(runBatch({ inputs: [file], outDir: dir, format: 'png', artboard: 'Nope' })).rejects.toThrow(/no artboard named/);
    await expect(runBatch({ inputs: [file], outDir: dir, format: 'png', sizes: 'wide' })).rejects.toThrow(/Cannot read size/);
    const bad = join(dir, 'bad.vstudio'); writeFileSync(bad, '{"nope":1}');
    await expect(runBatch({ inputs: [bad], outDir: dir, format: 'png' })).rejects.toThrow(/Not a Vector Studio/);
    const a = join(dir, 'bad.json'); writeFileSync(a, '[{"type":"explode"}]');
    await expect(runBatch({ inputs: [file], outDir: dir, format: 'png', actionsFile: a })).rejects.toThrow(/Invalid action list/);
  });
});

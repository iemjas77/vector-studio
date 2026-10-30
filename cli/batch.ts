import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { applyActions, parseActions } from '../src/automation/actions';
import { parseSizes, sizeVariants } from '../src/automation/batch';
import { parseDocument, type Artboard, type FitMode, type VDocument } from '../src/core/document';
import { exportPdf, exportSvg, setJpegPpi, setPngPpi } from '../src/core/io';
import { fonts } from '../src/core/text';
import { rasterizeArtboard, type CanvasFactory } from '../src/render/export';

export interface BatchOptions {
  inputs: string[];
  outDir: string;
  format: 'png' | 'jpeg' | 'pdf' | 'svg';
  /** Artboard name, or "all" (default). */
  artboard?: string;
  /** One "WxH" per line (or comma separated): re-target each design to these sizes first. */
  sizes?: string;
  mode?: FitMode;
  /** Path to a JSON action list applied to every document before export. */
  actionsFile?: string;
  transparent?: boolean;
  scale?: number;
  width?: number;
  ppi?: number;
  quality?: number;
}

const make: CanvasFactory = (w, h) => {
  const canvas = createCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D };
};

const safe = (s: string) => s.replace(/[^\w.\- ]+/g, '_').trim() || 'artboard';
let fontsReady = false;

/** Bundled Inter + system fonts (same discovery the desktop app uses), so text renders identically in batch mode. */
async function ensureFonts(doc: VDocument): Promise<void> {
  if (!fontsReady) {
    const root = new URL('../src/assets/fonts/', import.meta.url);
    fonts.register({ family: 'Inter', weight: 400, italic: false }, new Uint8Array(readFileSync(new URL('Inter-Regular.otf', root))));
    fonts.register({ family: 'Inter', weight: 700, italic: false }, new Uint8Array(readFileSync(new URL('Inter-Bold.otf', root))));
    try {
      const req = createRequire(import.meta.url);
      const sys = req('../electron/fonts.cjs') as { listFonts(): { key: string; family: string; weight: number; italic: boolean }[]; readFont(k: string): Buffer };
      await fonts.addSource({ list: async () => sys.listFonts(), load: async (k) => new Uint8Array(sys.readFont(k)) });
    } catch { /* system fonts unavailable: bundled font only */ }
    fontsReady = true;
  }
  const want: { family: string; weight: number; italic: boolean }[] = [];
  const walk = (els: VDocument['layers'][number]['children']) => els.forEach((e) => {
    if (e.type === 'text') want.push({ family: e.fontFamily, weight: e.fontWeight, italic: e.italic });
    if (e.type === 'group') walk(e.children);
  });
  doc.layers.forEach((l) => walk(l.children));
  if (want.length) await fonts.ensure(want);
}

/** Runs the batch and returns the paths of the files written. Throws on the first bad input so nothing is silently skipped. */
export async function runBatch(o: BatchOptions): Promise<string[]> {
  if (o.inputs.length === 0) throw new Error('No input files');
  mkdirSync(o.outDir, { recursive: true });
  const actions = o.actionsFile ? parseActions(JSON.parse(readFileSync(o.actionsFile, 'utf8'))) : [];
  const sizes = o.sizes ? parseSizes(o.sizes.replace(/,\s*(?=\d)/g, '\n')) : null;
  const written: string[] = [];
  for (const file of o.inputs) {
    let doc = parseDocument(readFileSync(file, 'utf8'));
    if (actions.length) doc = applyActions(doc, actions).doc;
    await ensureFonts(doc);
    const base = safe(basename(file).replace(/\.[^.]+$/, ''));
    const abs: Artboard[] = !o.artboard || o.artboard === 'all' ? doc.artboards : doc.artboards.filter((a) => a.name === o.artboard);
    if (abs.length === 0) throw new Error(`${file}: no artboard named "${o.artboard}"`);
    const jobs: { name: string; doc: VDocument; ab: Artboard }[] = [];
    for (const ab of abs) {
      if (sizes) for (const v of sizeVariants(doc, ab.id, sizes, o.mode ?? 'fit')) jobs.push({ name: `${base}-${safe(ab.name)}-${safe(v.name)}`, doc: v.doc, ab: v.artboard });
      else jobs.push({ name: abs.length > 1 ? `${base}-${safe(ab.name)}` : base, doc, ab });
    }
    if (o.format === 'pdf') {
      const p = join(o.outDir, `${base}.pdf`);
      writeFileSync(p, exportPdf(doc, abs));
      written.push(p);
      continue;
    }
    for (const j of jobs) {
      const ext = o.format === 'jpeg' ? 'jpg' : o.format;
      const p = join(o.outDir, `${j.name}.${ext}`);
      if (o.format === 'svg') writeFileSync(p, exportSvg(j.doc, j.ab));
      else {
        const jpeg = o.format === 'jpeg';
        const off = rasterizeArtboard(j.doc, j.ab, make, { scale: o.scale, width: sizes ? undefined : o.width, transparent: jpeg ? false : o.transparent, flatten: jpeg ? (j.ab.background ?? '#ffffff') : undefined });
        const canvas = off.canvas as unknown as { toBuffer(t: 'image/png'): Buffer; toBuffer(t: 'image/jpeg', q: number): Buffer };
        let bytes: Uint8Array = jpeg ? canvas.toBuffer('image/jpeg', Math.round((o.quality ?? 0.92) * 100)) : canvas.toBuffer('image/png');
        const ppi = o.ppi ?? j.doc.ppi;
        bytes = jpeg ? setJpegPpi(bytes, ppi) : setPngPpi(bytes, ppi);
        writeFileSync(p, bytes);
      }
      written.push(p);
    }
  }
  return written;
}

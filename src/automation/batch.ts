import { produce } from 'immer';
import { resizeArtboardWithContent, type Artboard, type FitMode, type VDocument } from '../core/document';

export interface SizeSpec { name: string; width: number; height: number }

/** Parses lines like "4500x5400", "3000×3000 Square" or "1500x1800, small". Throws with the offending line on bad input. */
export function parseSizes(text: string): SizeSpec[] {
  const out: SizeSpec[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[, ]?\s*(.*)$/i.exec(line);
    if (!m) throw new Error(`Cannot read size "${line}" – use WIDTHxHEIGHT, e.g. 4500x5400`);
    const w = +m[1], h = +m[2];
    if (!(w >= 1 && h >= 1 && w <= 16384 && h <= 16384)) throw new Error(`Size "${line}" is out of range (1–16384 px)`);
    out.push({ width: w, height: h, name: (m[3] || `${w}x${h}`).trim() });
  }
  if (out.length === 0) throw new Error('Enter at least one size');
  return out;
}

export interface Variant { name: string; doc: VDocument; artboard: Artboard }

/** One document copy per target size (content scaled to fit/fill), ready to export. The source document is untouched. */
export function sizeVariants(doc: VDocument, artboardId: string, sizes: SizeSpec[], mode: FitMode): Variant[] {
  if (!doc.artboards.some((a) => a.id === artboardId)) throw new Error('Artboard not found');
  return sizes.map((s) => {
    const d = produce(doc, (draft) => { resizeArtboardWithContent(draft, artboardId, s.width, s.height, mode); });
    return { name: s.name, doc: d, artboard: d.artboards.find((a) => a.id === artboardId)! };
  });
}

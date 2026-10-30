import ImageTracer from 'imagetracerjs';
import { createGroup, type Element, type VDocument } from '../document';
import { importSvg } from './svg-import';
import { parseColor } from './colors';

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8ClampedArray;
}

export interface TraceOptions {
  /** Number of colours to quantise to (2 = black & white style). */
  colors: number;
  detail: 'low' | 'medium' | 'high';
  /** Ignore specks smaller than this many pixels. */
  minArea: number;
  /** Drop regions that have the colour of the image corner (typical white/flat backgrounds). */
  removeBackground: boolean;
  /** 0 = off. Smooths noisy photos before tracing. */
  blur: number;
}

export const TRACE_PRESETS: Record<string, { label: string; options: TraceOptions }> = {
  logo: { label: 'Logo / flat colours (8 colours)', options: { colors: 8, detail: 'medium', minArea: 8, removeBackground: true, blur: 0 } },
  bw: { label: 'Black and white', options: { colors: 2, detail: 'medium', minArea: 8, removeBackground: true, blur: 0 } },
  illustration: { label: 'Illustration (16 colours, more detail)', options: { colors: 16, detail: 'high', minArea: 4, removeBackground: false, blur: 0 } },
  photo: { label: 'Photo (24 colours, smoothed)', options: { colors: 24, detail: 'low', minArea: 16, removeBackground: false, blur: 2 } },
};

export interface TraceResult {
  elements: Element[];
  width: number;
  height: number;
  pathCount: number;
  warnings: string[];
}

const MAX_PIXELS = 4096 * 4096;

/** Raster → vector. Runs ImageTracer (colour quantisation + curve fitting) and imports the result as editable paths. */
export function traceImage(img: RasterImage, o: TraceOptions): TraceResult {
  if (!(img.width > 0 && img.height > 0) || img.data.length < img.width * img.height * 4) throw new Error('Invalid image data');
  if (img.width * img.height > MAX_PIXELS) throw new Error('Image is too large to trace (limit 16 megapixels); scale it down first');
  const d = { width: img.width, height: img.height, data: img.data };
  const svg = ImageTracer.imagedataToSVG(d, {
    numberofcolors: Math.max(2, Math.min(64, Math.round(o.colors))),
    ltres: o.detail === 'high' ? 0.5 : o.detail === 'low' ? 2 : 1,
    qtres: o.detail === 'high' ? 0.5 : o.detail === 'low' ? 2 : 1,
    pathomit: Math.max(0, o.minArea),
    colorquantcycles: 3,
    strokewidth: 0,
    blurradius: o.blur,
    blurdelta: 20,
    roundcoords: 2,
    viewbox: true,
    desc: false,
  });
  const { doc, warnings } = importSvg(svg, 'Traced');
  let elements: Element[] = doc.layers.flatMap((l) => l.children);
  if (o.removeBackground) {
    const bg = [img.data[0], img.data[1], img.data[2]];
    const near = (hex: string) => { const c = parseColor(hex); if (!c) return false; const r = parseInt(c.color.slice(1, 3), 16), g = parseInt(c.color.slice(3, 5), 16), b = parseInt(c.color.slice(5, 7), 16); return Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 24; };
    elements = elements.filter((e) => !(e.type !== 'group' && e.fill && e.fill.type === 'solid' && near(e.fill.color)));
  }
  return { elements, width: img.width, height: img.height, pathCount: elements.length, warnings };
}

/** Wraps traced elements in one group, scaled to fit within `maxW`×`maxH` and centred on (cx, cy). */
export function placeTrace(t: TraceResult, cx: number, cy: number, maxW: number, maxH: number): Element {
  const s = Math.min(1, maxW / t.width, maxH / t.height);
  const g = createGroup(t.elements, { name: 'Traced image' });
  g.transform = [s, 0, 0, s, cx - (t.width * s) / 2, cy - (t.height * s) / 2];
  return g;
}

export type { VDocument };

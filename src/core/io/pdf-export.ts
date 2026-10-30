import { apply, IDENTITY } from '../geometry/matrix';
import type { Matrix, PathNode } from '../geometry/types';
import { pathBounds } from '../geometry/path';
import { elementSubpaths, sortStops, type Artboard, type Element, type GradientPaint, type ShapeElement, type SolidPaint, type Stroke, type VDocument } from '../document';

/**
 * Vector PDF writer (PDF 1.4, uncompressed). One page per artboard.
 * Supported: fills/strokes (solid, alpha), compound paths (even-odd/non-zero), caps/joins/dashes, transforms,
 * clipping masks, linear/radial gradients (colour only — stop alpha is ignored), opacity (multiplied down to shapes,
 * so overlapping children of a translucent group are NOT composited as one unit).
 */

const f = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? '0' : String(r);
};
const rgb = (hex: string) => [1, 3, 5].map((i) => f(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');

interface Ctx {
  ops: string[];
  gsNames: Map<string, string>;
  shadings: string[];
}

const PDF_BLEND: Record<string, string> = {
  multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten', 'color-dodge': 'ColorDodge', 'color-burn': 'ColorBurn',
  'hard-light': 'HardLight', 'soft-light': 'SoftLight', difference: 'Difference', exclusion: 'Exclusion', hue: 'Hue', saturation: 'Saturation', color: 'Color', luminosity: 'Luminosity',
};

function gsName(ctx: Ctx, ca: number, CA: number, bm = 'Normal'): string {
  const key = `${f(ca)}/${f(CA)}/${bm}`;
  let n = ctx.gsNames.get(key);
  if (!n) { n = `GS${ctx.gsNames.size + 1}`; ctx.gsNames.set(key, n); }
  return n;
}

function tracePdf(nodes: readonly PathNode[], closed: boolean, tf: Matrix | null): string {
  if (nodes.length === 0) return '';
  const P = (x: number, y: number) => (tf ? apply(tf, { x, y }) : { x, y });
  const H = (dx: number, dy: number) => (tf ? { x: tf[0] * dx + tf[2] * dy, y: tf[1] * dx + tf[3] * dy } : { x: dx, y: dy });
  const p0 = P(nodes[0].x, nodes[0].y);
  let s = `${f(p0.x)} ${f(p0.y)} m\n`;
  const count = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    const pb = P(b.x, b.y);
    if (!a.outX && !a.outY && !b.inX && !b.inY) s += `${f(pb.x)} ${f(pb.y)} l\n`;
    else {
      const pa = P(a.x, a.y), ho = H(a.outX, a.outY), hi = H(b.inX, b.inY);
      s += `${f(pa.x + ho.x)} ${f(pa.y + ho.y)} ${f(pb.x + hi.x)} ${f(pb.y + hi.y)} ${f(pb.x)} ${f(pb.y)} c\n`;
    }
  }
  if (closed) s += 'h\n';
  return s;
}

function shapePath(el: ShapeElement, tf: Matrix | null): string {
  return elementSubpaths(el).map((sp) => tracePdf(sp.nodes, sp.closed, tf)).join('');
}

function shadingFor(ctx: Ctx, g: GradientPaint): string {
  const stops = sortStops(g.stops);
  const first = stops[0], last = stops[stops.length - 1];
  const all = [...(first.offset > 0 ? [{ ...first, offset: 0 }] : []), ...stops, ...(last.offset < 1 ? [{ ...last, offset: 1 }] : [])];
  const fn = (a: string, b: string) => `<< /FunctionType 2 /Domain [0 1] /C0 [${rgb(a)}] /C1 [${rgb(b)}] /N 1 >>`;
  let func: string;
  if (all.length === 2) func = fn(all[0].color, all[1].color);
  else {
    const fns = all.slice(0, -1).map((s, i) => fn(s.color, all[i + 1].color)).join(' ');
    const bounds = all.slice(1, -1).map((s) => f(s.offset)).join(' ');
    func = `<< /FunctionType 3 /Domain [0 1] /Functions [${fns}] /Bounds [${bounds}] /Encode [${all.slice(0, -1).map(() => '0 1').join(' ')}] >>`;
  }
  const dict = g.type === 'linear'
    ? `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${f(g.x1)} ${f(g.y1)} ${f(g.x2)} ${f(g.y2)}] /Function ${func} /Extend [true true] >>`
    : `<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [${f(g.cx)} ${f(g.cy)} 0 ${f(g.cx)} ${f(g.cy)} ${f(g.r)}] /Function ${func} /Extend [true true] >>`;
  ctx.shadings.push(dict);
  return `Sh${ctx.shadings.length}`;
}

function strokeOps(st: Stroke): string {
  const cap = { butt: 0, round: 1, square: 2 }[st.cap], join = { miter: 0, round: 1, bevel: 2 }[st.join];
  const dash = st.dash.length ? (st.dash.length % 2 ? [...st.dash, ...st.dash] : st.dash) : [];
  return `${f(st.width)} w ${cap} J ${join} j ${f(st.miterLimit)} M [${dash.map(f).join(' ')}] 0 d\n`;
}

function drawShape(ctx: Ctx, el: ShapeElement, opacity: number, bm: string): void {
  const fill = el.fill, stroke = el.stroke && el.stroke.width > 0 ? el.stroke : null;
  const rule = el.type === 'path' && el.fillRule === 'evenodd' ? '*' : '';
  const path = shapePath(el, null);
  if (!path) return;
  const canFill = !!fill && (el.type !== 'path' || el.closed || el.nodes.length > 2 || el.extra.length > 0);
  if (canFill && fill.type !== 'solid') {
    let b: { x: number; y: number; w: number; h: number } | null = null;
    for (const sp of elementSubpaths(el)) {
      const pb = pathBounds(sp.nodes, sp.closed);
      if (pb) b = b ? { x: Math.min(b.x, pb.x), y: Math.min(b.y, pb.y), w: Math.max(b.x + b.w, pb.x + pb.w) - Math.min(b.x, pb.x), h: Math.max(b.y + b.h, pb.y + pb.h) - Math.min(b.y, pb.y) } : pb;
    }
    if (b && b.w > 0 && b.h > 0) {
      const name = shadingFor(ctx, fill);
      ctx.ops.push(`q\n/${gsName(ctx, opacity, opacity, bm)} gs\n${path}W${rule} n\n${f(b.w)} 0 0 ${f(b.h)} ${f(b.x)} ${f(b.y)} cm\n/${name} sh\nQ\n`);
    }
  }
  const solidFill: SolidPaint | null = canFill && fill && fill.type === 'solid' ? fill : null;
  if (!solidFill && !stroke) return;
  let s = `q\n/${gsName(ctx, (solidFill?.alpha ?? 1) * opacity, (stroke?.paint.alpha ?? 1) * opacity, bm)} gs\n`;
  if (solidFill) s += `${rgb(solidFill.color)} rg\n`;
  if (stroke) s += `${rgb(stroke.paint.color)} RG\n${strokeOps(stroke)}`;
  s += path;
  s += solidFill && stroke ? `B${rule}\n` : solidFill ? `f${rule}\n` : 'S\n';
  ctx.ops.push(s + 'Q\n');
}

function drawElement(ctx: Ctx, el: Element, opacity: number, inheritedBm = 'Normal'): void {
  if (!el.visible) return;
  const bm = el.blend ? PDF_BLEND[el.blend] ?? inheritedBm : inheritedBm;   // blend modes are carried down to the shapes; live effects cannot be expressed in PDF
  const t = el.transform;
  const op = opacity * el.opacity;
  ctx.ops.push('q\n');
  if (t.some((v, i) => v !== IDENTITY[i])) ctx.ops.push(`${t.map(f).join(' ')} cm\n`);
  if (el.type === 'group') {
    if (el.clip && el.children.length > 1) {
      const clipEl = el.children[el.children.length - 1];
      if (clipEl.type !== 'group') {
        // Clip path is emitted in the group's space by pre-transforming its coordinates (a cm would also affect the children).
        ctx.ops.push(clipEl.type === 'rect' && clipEl.rx === 0
          ? `${tracePdf([{ x: clipEl.x, y: clipEl.y, inX: 0, inY: 0, outX: 0, outY: 0 }, { x: clipEl.x + clipEl.w, y: clipEl.y, inX: 0, inY: 0, outX: 0, outY: 0 }, { x: clipEl.x + clipEl.w, y: clipEl.y + clipEl.h, inX: 0, inY: 0, outX: 0, outY: 0 }, { x: clipEl.x, y: clipEl.y + clipEl.h, inX: 0, inY: 0, outX: 0, outY: 0 }], true, clipEl.transform)}W n\n`
          : `${shapePath(clipEl, clipEl.transform)}W${clipEl.type === 'path' && clipEl.fillRule === 'evenodd' ? '*' : ''} n\n`);
      }
      for (const c of el.children.slice(0, -1)) drawElement(ctx, c, op, bm);
    } else for (const c of el.children) drawElement(ctx, c, op, bm);
  } else drawShape(ctx, el, op, bm);
  ctx.ops.push('Q\n');
}

const latin1 = (s: string) => {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
  return u;
};

/** Exports the given artboards (default: all) as a multi-page PDF. 1 document unit = 1/ppi inch. */
export interface PdfOptions {
  /** Extra area beyond the artboard on every side, in document units. The artboard becomes the TrimBox. */
  bleed?: number;
}

export function exportPdf(doc: VDocument, artboards: Artboard[] = doc.artboards, opts: PdfOptions = {}): Uint8Array {
  const scale = 72 / doc.ppi;
  const bleed = Math.max(0, opts.bleed ?? 0);
  const objects: string[] = [];
  const reserve = () => objects.push('') ;
  const set = (n: number, body: string) => { objects[n - 1] = body; };
  reserve(); reserve(); // 1 catalog, 2 pages
  const pageIds: number[] = [];

  for (const ab of artboards) {
    const ctx: Ctx = { ops: [], gsNames: new Map(), shadings: [] };
    const B = bleed * scale;
    const W = ab.w * scale + 2 * B, H = ab.h * scale + 2 * B;
    // Page origin is the bleed corner; document point (ab.x - bleed, ab.y - bleed) maps to the page's top-left.
    ctx.ops.push(`q\n0 0 ${f(W)} ${f(H)} re W n\n${f(scale)} 0 0 ${f(-scale)} ${f(-(ab.x - bleed) * scale)} ${f(H + (ab.y - bleed) * scale)} cm\n`);
    if (ab.background) ctx.ops.push(`${rgb(ab.background)} rg\n${f(ab.x - bleed)} ${f(ab.y - bleed)} ${f(ab.w + 2 * bleed)} ${f(ab.h + 2 * bleed)} re f\n`);
    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      for (const el of layer.children) drawElement(ctx, el, 1);
    }
    ctx.ops.push('Q\n');
    const content = ctx.ops.join('');
    const contentId = objects.length + 1; reserve();
    const pageId = objects.length + 1; reserve();
    pageIds.push(pageId);
    const gsDict = [...ctx.gsNames.entries()].map(([k, n]) => { const [ca, CA, bm] = k.split('/'); return `/${n} << /Type /ExtGState /ca ${ca} /CA ${CA}${bm && bm !== 'Normal' ? ` /BM /${bm}` : ''} >>`; }).join(' ');
    const shDict = ctx.shadings.map((d, i) => `/Sh${i + 1} ${d}`).join(' ');
    set(contentId, `<< /Length ${content.length} >>\nstream\n${content}endstream`);
    set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}]${bleed > 0 ? ` /BleedBox [0 0 ${f(W)} ${f(H)}] /TrimBox [${f(B)} ${f(B)} ${f(W - B)} ${f(H - B)}]` : ''} /Contents ${contentId} 0 R /Resources << /ExtGState << ${gsDict} >> /Shading << ${shDict} >> >> >>`);
  }
  set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  set(2, `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const infoId = objects.length + 1;
  objects.push('<< /Producer (Vector Studio) >>');

  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1(pdf);
}

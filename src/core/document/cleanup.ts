import type { Matrix, Rect } from '../geometry/types';
import { elementBounds } from './query';
import type { Element, Paint, VDocument } from './types';
import { aboutPoint, scale as scaleM, translate, multiply } from '../geometry/matrix';
import { transformWorld } from './ops';

export interface CleanupOptions {
  removeHidden: boolean;
  removeEmptyGroups: boolean;
  /** Remove shapes whose area is smaller than this (square document units). 0 = off. */
  minArea: number;
  /** Merge consecutive anchors closer than this (document units). 0 = off. */
  mergeDistance: number;
  /** Remove open paths that have neither stroke nor fill (invisible). */
  removeInvisible: boolean;
}

export interface CleanupReport {
  removedObjects: number;
  removedNodes: number;
  removedGroups: number;
}

export const DEFAULT_CLEANUP: CleanupOptions = { removeHidden: true, removeEmptyGroups: true, minArea: 1, mergeDistance: 0.01, removeInvisible: true };

/** Vector clean-up for print: strips junk that causes problems at the printer or bloats files. Mutates the (draft) document. */
export function cleanupDocument(doc: VDocument, o: CleanupOptions): CleanupReport {
  const rep: CleanupReport = { removedObjects: 0, removedNodes: 0, removedGroups: 0 };
  const visit = (list: Element[]): Element[] => {
    const out: Element[] = [];
    for (const el of list) {
      if (o.removeHidden && !el.visible) { rep.removedObjects++; continue; }
      if (el.type === 'group') {
        el.children = visit(el.children);
        if (o.removeEmptyGroups && el.children.length === 0) { rep.removedGroups++; continue; }
        out.push(el);
        continue;
      }
      if (el.type === 'path' || el.type === 'rect' || el.type === 'ellipse') {
        const visible = !!el.fill || (!!el.stroke && el.stroke.width > 0);
        const closedShape = el.type !== 'path' || el.closed || el.extra.length > 0;
        if (o.removeInvisible && (!visible || (!el.stroke && !closedShape))) { rep.removedObjects++; continue; }
      }
      if (o.minArea > 0) {
        const b = elementBounds(el);
        const stroked = el.type !== 'text' && !!el.stroke && el.stroke.width > 0;
        if (b && !stroked && b.w * b.h < o.minArea && el.type !== 'text') { rep.removedObjects++; continue; }
      }
      if (o.mergeDistance > 0 && el.type === 'path') {
        const merge = (nodes: typeof el.nodes, closed: boolean) => {
          const res: typeof nodes = [];
          for (const n of nodes) {
            const last = res[res.length - 1];
            if (last && Math.hypot(n.x - last.x, n.y - last.y) < o.mergeDistance) {
              // Keep the incoming handle of the dropped node as the survivor's outgoing handle's partner.
              last.outX = n.outX; last.outY = n.outY;
              rep.removedNodes++;
            } else res.push({ ...n });
          }
          if (closed && res.length > 1) {
            const f = res[0], l = res[res.length - 1];
            if (Math.hypot(f.x - l.x, f.y - l.y) < o.mergeDistance) { f.inX = l.inX; f.inY = l.inY; res.pop(); rep.removedNodes++; }
          }
          return res;
        };
        el.nodes = merge(el.nodes, el.closed);
        el.extra = el.extra.map((s) => ({ closed: s.closed, nodes: merge(s.nodes, s.closed) }));
      }
      out.push(el);
    }
    return out;
  };
  for (const layer of doc.layers) layer.children = visit(layer.children);
  return rep;
}

// ---- colours ----
export interface ColorUse { color: string; count: number }

const rgbOf = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const hexOf = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function eachPaint(doc: VDocument, fn: (get: () => Paint | null, set: (p: Paint) => void) => void): void {
  const visit = (list: Element[]) => {
    for (const el of list) {
      if (el.type === 'group') { visit(el.children); continue; }
      if (el.fill) fn(() => el.fill, (p) => { el.fill = p; });
      if (el.stroke) { const s = el.stroke; fn(() => s.paint, (p) => { if (p.type === 'solid') s.paint = p; }); }
    }
  };
  doc.layers.forEach((l) => visit(l.children));
}

/** Distinct solid colours (fills, strokes and gradient stops) with usage counts, most used first. */
export function listColors(doc: VDocument): ColorUse[] {
  const m = new Map<string, number>();
  eachPaint(doc, (get) => {
    const p = get();
    if (!p) return;
    if (p.type === 'solid') m.set(p.color, (m.get(p.color) ?? 0) + 1);
    else for (const s of p.stops) m.set(s.color, (m.get(s.color) ?? 0) + 1);
  });
  return [...m.entries()].map(([color, count]) => ({ color, count })).sort((a, b) => b.count - a.count || a.color.localeCompare(b.color));
}

/** Deterministic k-means (farthest-point seeding) over the document's colours, weighted by usage. */
export function computePalette(colors: ColorUse[], k: number): string[] {
  if (colors.length <= k) return colors.map((c) => c.color);
  const pts = colors.map((c) => ({ rgb: rgbOf(c.color), w: c.count }));
  const centers: number[][] = [pts[0].rgb.slice()];
  while (centers.length < k) {
    let best = -1, bestD = -1;
    pts.forEach((p, i) => { const d = Math.min(...centers.map((c) => dist2(c, p.rgb))); if (d > bestD) { bestD = d; best = i; } });
    centers.push(pts[best].rgb.slice());
  }
  for (let iter = 0; iter < 25; iter++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => { const d = dist2(c, p.rgb); if (d < bd) { bd = d; bi = i; } });
      sum[bi][0] += p.rgb[0] * p.w; sum[bi][1] += p.rgb[1] * p.w; sum[bi][2] += p.rgb[2] * p.w; sum[bi][3] += p.w;
    }
    let moved = 0;
    sum.forEach((s, i) => { if (s[3] > 0) { const n = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; moved += dist2(n, centers[i]); centers[i] = n; } });
    if (moved < 0.01) break;
  }
  return [...new Set(centers.map(hexOf))];
}

export interface ColorReduction { palette: string[]; mapping: Record<string, string>; changed: number }

/** Snap every colour in the document to the nearest of `maxColors` palette colours (screen-printing friendly). Mutates the draft. */
export function reduceColors(doc: VDocument, maxColors: number): ColorReduction {
  const palette = computePalette(listColors(doc), Math.max(1, Math.floor(maxColors)));
  const mapping: Record<string, string> = {};
  const nearest = (hex: string) => {
    if (mapping[hex]) return mapping[hex];
    const rgb = rgbOf(hex);
    let best = palette[0], bd = Infinity;
    for (const p of palette) { const d = dist2(rgbOf(p), rgb); if (d < bd) { bd = d; best = p; } }
    return (mapping[hex] = best);
  };
  let changed = 0;
  eachPaint(doc, (get, set) => {
    const p = get();
    if (!p) return;
    if (p.type === 'solid') { const n = nearest(p.color); if (n !== p.color) { set({ ...p, color: n }); changed++; } }
    else {
      const stops = p.stops.map((s) => { const n = nearest(s.color); if (n !== s.color) changed++; return { ...s, color: n }; });
      set({ ...p, stops });
    }
  });
  return { palette, mapping, changed };
}

export function replaceColor(doc: VDocument, from: string, to: string): number {
  let n = 0;
  eachPaint(doc, (get, set) => {
    const p = get();
    if (!p) return;
    if (p.type === 'solid') { if (p.color.toLowerCase() === from.toLowerCase()) { set({ ...p, color: to }); n++; } }
    else set({ ...p, stops: p.stops.map((s) => (s.color.toLowerCase() === from.toLowerCase() ? (n++, { ...s, color: to }) : s)) });
  });
  return n;
}

// ---- batch resize ----
export type FitMode = 'none' | 'fit' | 'fill';

/**
 * Resize an artboard. With `fit`/`fill` all content on the artboard is scaled uniformly (contain / cover) and centred,
 * so one design can be re-targeted to many print sizes.
 */
export function resizeArtboardWithContent(doc: VDocument, artboardId: string, w: number, h: number, mode: FitMode): void {
  const ab = doc.artboards.find((a) => a.id === artboardId);
  if (!ab || !(w > 0) || !(h > 0)) return;
  const old: Rect = { x: ab.x, y: ab.y, w: ab.w, h: ab.h };
  if (mode !== 'none') {
    const s = mode === 'fit' ? Math.min(w / old.w, h / old.h) : Math.max(w / old.w, h / old.h);
    const cx = old.x + old.w / 2, cy = old.y + old.h / 2;
    const m: Matrix = multiply(translate(old.x + w / 2 - cx, old.y + h / 2 - cy), aboutPoint(scaleM(s, s), { x: cx, y: cy }));
    const ids: string[] = [];
    for (const l of doc.layers) for (const el of l.children) {
      const b = elementBounds(el);
      if (b && b.x < old.x + old.w && b.x + b.w > old.x && b.y < old.y + old.h && b.y + b.h > old.y) ids.push(el.id);
    }
    transformWorld(doc, ids, m);
  }
  ab.w = w; ab.h = h;
}

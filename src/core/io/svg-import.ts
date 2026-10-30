import { XMLParser } from 'fast-xml-parser';
import { IDENTITY, multiply, rotate, scale, translate } from '../geometry/matrix';
import type { Matrix } from '../geometry/types';
import {
  createArtboard, createDocument, createEllipse, createGroup, createLayer, createPath, createRect, defaultStroke, solid,
  type Element, type Layer, type Paint, type Stroke, type VDocument,
} from '../document';
import { node } from '../geometry/path';
import { parseColor } from './colors';
import { elementSubpaths, solidOf } from '../document';
import { pathBounds } from '../geometry/path';
import { unionRect } from '../geometry/matrix';
import { parsePathData } from './svg-path';

export interface SvgImportResult {
  doc: VDocument;
  warnings: string[];
}

type XNode = Record<string, unknown>;
interface Style {
  fill: string; stroke: string; strokeWidth: number; cap: Stroke['cap']; join: Stroke['join']; miter: number;
  dash: number[]; fillOpacity: number; strokeOpacity: number; evenodd: boolean; hidden: boolean;
}
const DEFAULT_STYLE: Style = {
  fill: '#000000', stroke: 'none', strokeWidth: 1, cap: 'butt', join: 'miter', miter: 4, dash: [], fillOpacity: 1, strokeOpacity: 1, evenodd: false, hidden: false,
};

const UNIT: Record<string, number> = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, '': 1 };
function length(v: string | undefined): number | null {
  if (v === undefined) return null;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(v);
  if (!m) return null;
  return parseFloat(m[1]) * UNIT[(m[2] ?? '').toLowerCase()];
}
const numAttr = (a: Record<string, string>, k: string, def = 0) => length(a[k]) ?? def;

export function parseTransform(s: string | undefined): Matrix {
  let m: Matrix = IDENTITY;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(s))) {
    const a = t[2].split(/[\s,]+/).filter(Boolean).map(parseFloat);
    if (a.some((v) => !isFinite(v))) throw new Error(`Invalid transform "${s}"`);
    let n: Matrix = IDENTITY;
    switch (t[1]) {
      case 'matrix': if (a.length === 6) n = a as Matrix; break;
      case 'translate': n = translate(a[0] ?? 0, a[1] ?? 0); break;
      case 'scale': n = scale(a[0] ?? 1, a[1] ?? a[0] ?? 1); break;
      case 'rotate': {
        const r = rotate(((a[0] ?? 0) * Math.PI) / 180);
        n = a.length === 3 ? multiply(translate(a[1], a[2]), multiply(r, translate(-a[1], -a[2]))) : r;
        break;
      }
      case 'skewX': n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case 'skewY': n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = multiply(m, n);
  }
  return m;
}

function attrsOf(x: XNode): Record<string, string> {
  const raw = (x[':@'] ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) out[k.replace(/^@_/, '')] = String(v);
  return out;
}
const tagOf = (x: XNode): string | null => Object.keys(x).find((k) => k !== ':@' && k !== '#text') ?? null;
const childrenOf = (x: XNode): XNode[] => {
  const t = tagOf(x);
  return t && Array.isArray(x[t]) ? (x[t] as XNode[]) : [];
};

class Importer {
  warnings = new Set<string>();
  gradDefs = new Map<string, { tag: string; a: Record<string, string>; stops: XNode[] }>();
  /** Gradients in userSpaceOnUse units that must be normalised to the element's bounds once it exists. */
  pendingUser = new Map<Paint, { tag: string; a: Record<string, string> }>();
  clips = new Map<string, XNode[]>();
  warn(m: string) { this.warnings.add(m); }

  collectDefs(nodes: XNode[]) {
    for (const x of nodes) {
      const tag = tagOf(x);
      if (!tag) continue;
      const a = attrsOf(x);
      if (tag === 'clipPath' && a.id) {
        if (a.clipPathUnits === 'objectBoundingBox') this.warn('clipPath with objectBoundingBox units is not supported; mask ignored');
        else this.clips.set(a.id, childrenOf(x));
      }
      if ((tag === 'linearGradient' || tag === 'radialGradient') && a.id) {
        this.gradDefs.set(a.id, { tag, a, stops: childrenOf(x).filter((c) => tagOf(c) === 'stop') });
      }
      this.collectDefs(childrenOf(x));
    }
  }

  style(parent: Style, a: Record<string, string>): Style {
    const merged: Record<string, string> = { ...a };
    if (a.style) {
      for (const decl of a.style.split(';')) {
        const i = decl.indexOf(':');
        if (i > 0) merged[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
      }
    }
    const s = { ...parent };
    if (merged.fill !== undefined) s.fill = merged.fill;
    if (merged.stroke !== undefined) s.stroke = merged.stroke;
    if (merged['stroke-width'] !== undefined) s.strokeWidth = length(merged['stroke-width']) ?? s.strokeWidth;
    if (merged['stroke-linecap'] && ['butt', 'round', 'square'].includes(merged['stroke-linecap'])) s.cap = merged['stroke-linecap'] as Stroke['cap'];
    if (merged['stroke-linejoin'] && ['miter', 'round', 'bevel'].includes(merged['stroke-linejoin'])) s.join = merged['stroke-linejoin'] as Stroke['join'];
    if (merged['stroke-miterlimit']) s.miter = Math.max(1, parseFloat(merged['stroke-miterlimit']) || 4);
    if (merged['stroke-dasharray'] !== undefined) {
      s.dash = merged['stroke-dasharray'] === 'none' ? [] : merged['stroke-dasharray'].split(/[\s,]+/).map(parseFloat).filter((v) => isFinite(v) && v >= 0);
    }
    if (merged['fill-opacity'] !== undefined) s.fillOpacity = parseFloat(merged['fill-opacity']);
    if (merged['stroke-opacity'] !== undefined) s.strokeOpacity = parseFloat(merged['stroke-opacity']);
    if (merged['fill-rule'] === 'evenodd') s.evenodd = true;
    if (merged.display === 'none' || merged.visibility === 'hidden') s.hidden = true;
    return s;
  }

  paint(value: string, opacity: number): Paint | null {
    let v = value.trim();
    const url = /^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(v);
    if (url) return this.gradient(url[1], opacity);
    if (v === 'currentColor') v = '#000000';
    const c = parseColor(v);
    if (!c) {
      if (v !== 'none' && v !== 'transparent') this.warn(`Unsupported colour "${v}" ignored`);
      return null;
    }
    return solid(c.color, Math.max(0, Math.min(1, c.alpha * (isFinite(opacity) ? opacity : 1))));
  }

  /** Resolves xlink:href chains: attributes and stops fall back to the referenced gradient. */
  private resolveGradient(id: string, depth = 0): { tag: string; a: Record<string, string>; stops: XNode[] } | null {
    const g = this.gradDefs.get(id);
    if (!g) return null;
    const href = (g.a.href ?? g['a']['xlink:href'])?.replace(/^#/, '');
    if (!href || depth > 8) return g;
    const base = this.resolveGradient(href, depth + 1);
    if (!base) return g;
    return { tag: g.tag, a: { ...base.a, ...g.a, id }, stops: g.stops.length ? g.stops : base.stops };
  }

  private gradient(id: string, opacity: number): Paint | null {
    const g = this.resolveGradient(id);
    if (!g) { this.warn(`Gradient "${id}" was not found; fill ignored`); return null; }
    const stops = g.stops.map((s) => {
      const sa = attrsOf(s);
      const css: Record<string, string> = {};
      for (const d of (sa.style ?? '').split(';')) { const k = d.indexOf(':'); if (k > 0) css[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
      const col = parseColor(css['stop-color'] ?? sa['stop-color'] ?? '#000000') ?? { color: '#000000', alpha: 1 };
      const o = (sa.offset ?? '0').trim();
      const offset = Math.min(1, Math.max(0, o.endsWith('%') ? parseFloat(o) / 100 : parseFloat(o)));
      const so = parseFloat(css['stop-opacity'] ?? sa['stop-opacity'] ?? '1');
      return { offset: isFinite(offset) ? offset : 0, color: col.color, alpha: Math.max(0, Math.min(1, col.alpha * (isFinite(so) ? so : 1) * opacity)) };
    }).sort((p, q) => p.offset - q.offset);
    if (stops.length === 0) return null;
    if (stops.length === 1) stops.push({ ...stops[0], offset: 1 });
    if (g.a.gradientTransform) this.warn('gradientTransform is not supported yet; gradient drawn without it');
    if (g.a.spreadMethod && g.a.spreadMethod !== 'pad') this.warn('Gradient spreadMethod other than "pad" is not supported');
    const user = g.a.gradientUnits === 'userSpaceOnUse';
    const num = (k: string, def: number) => { const v = parseFloat(g.a[k] ?? ''); return isFinite(v) ? (g.a[k]!.trim().endsWith('%') ? v / 100 : v) : def; };
    let paint: Paint;
    if (g.tag === 'linearGradient') paint = { type: 'linear', stops, x1: num('x1', 0), y1: num('y1', 0), x2: num('x2', 1), y2: num('y2', 0) };
    else {
      if (g.a.fx !== undefined || g.a.fy !== undefined) this.warn('Radial gradient focal points (fx/fy) are not supported; centred instead');
      paint = { type: 'radial', stops, cx: num('cx', 0.5), cy: num('cy', 0.5), r: Math.max(1e-6, num('r', 0.5)) };
    }
    if (user) this.pendingUser.set(paint, { tag: g.tag, a: g.a });
    return paint;
  }

  /** Converts userSpaceOnUse gradient coordinates to bounding-box fractions using the finished element's bounds. */
  private fixGradient(el: Element): void {
    if (el.type === 'group' || !el.fill || el.fill.type === 'solid') return;
    if (!this.pendingUser.has(el.fill)) return;
    let b: { x: number; y: number; w: number; h: number } | null = null;
    for (const sp of elementSubpaths(el)) {
      const pb = pathBounds(sp.nodes, sp.closed);
      if (pb) b = b ? unionRect(b, pb) : pb;
    }
    this.pendingUser.delete(el.fill);
    if (!b || b.w <= 0 || b.h <= 0) { el.fill = solidOf(el.fill); return; }
    const f = el.fill;
    const nx = (v: number) => (v - b.x) / b.w, ny = (v: number) => (v - b.y) / b.h;
    if (f.type === 'linear') { f.x1 = nx(f.x1); f.y1 = ny(f.y1); f.x2 = nx(f.x2); f.y2 = ny(f.y2); } else { f.cx = nx(f.cx); f.cy = ny(f.cy); f.r = f.r / b.w; }
  }

  appearance(st: Style) {
    const fill = this.paint(st.fill, st.fillOpacity);
    let sp = this.paint(st.stroke, st.strokeOpacity);
    if (sp && sp.type !== 'solid') { this.warn('Gradient strokes are not supported; first gradient colour used'); sp = solidOf(sp); }
    const stroke: Stroke | null = sp && st.strokeWidth > 0
      ? { ...defaultStroke(), paint: sp, width: st.strokeWidth, cap: st.cap, join: st.join, miterLimit: st.miter, dash: st.dash }
      : null;
    return { fill, stroke };
  }

  convert(x: XNode, parent: Style): Element[] {
    const tag = tagOf(x);
    if (!tag || tag === '#text') return [];
    const a = attrsOf(x);
    const clipRef = /url\(\s*['"]?#([^)'"]+)/.exec(a['clip-path'] ?? '')?.[1];
    if (clipRef && this.clips.has(clipRef) && tag !== 'clipPath') {
      const raw = { ...((x[':@'] ?? {}) as Record<string, unknown>) };
      const wrapperTransform = parseTransform(a.transform);
      delete raw['@_clip-path']; delete raw['@_transform'];
      const inner = this.convert({ ...x, ':@': raw }, parent);
      const clipChild = this.clips.get(clipRef)!.map((c) => this.convert(c, DEFAULT_STYLE)).flat().find((e) => e.type !== 'group');
      if (inner.length && clipChild) return [createGroup([...inner, clipChild], { name: a['data-name'] ?? 'Clipping group', clip: true, transform: wrapperTransform })];
      return inner;
    }
    const st = this.style(parent, a);
    if (st.hidden) return [];
    for (const decl of (a.style ?? '').split(';')) {
      const i = decl.indexOf(':');
      if (i > 0 && decl.slice(0, i).trim() === 'opacity') a.opacity = decl.slice(i + 1).trim();
    }
    const common = {
      name: a['data-name'] ?? a.id ?? undefined,
      opacity: a.opacity !== undefined ? Math.max(0, Math.min(1, parseFloat(a.opacity))) : 1,
      transform: parseTransform(a.transform),
    };
    const named = <T extends Element>(el: T, def: string): T => {
      this.fixGradient(el);
      el.name = common.name || def;
      el.opacity = common.opacity;
      el.transform = common.transform;
      return el;
    };
    if (st.evenodd && ['polygon', 'polyline', 'rect', 'circle', 'ellipse'].includes(tag)) {
      this.warn('fill-rule="evenodd" only matters for paths; ignored on simple shapes');
    }
    const look = () => this.appearance(st);
    switch (tag) {
      case 'g': case 'a': {
        const kids = childrenOf(x).flatMap((c) => this.convert(c, st));
        if (kids.length === 0) return [];
        return [named(createGroup(kids), 'Group')];
      }
      case 'rect': {
        const w = numAttr(a, 'width'), h = numAttr(a, 'height');
        if (w <= 0 || h <= 0) return [];
        const rx = length(a.rx), ry = length(a.ry);
        let r = rx ?? ry ?? 0;
        if (rx !== null && ry !== null && rx !== ry) { this.warn('Rectangles with different rx/ry use rx for all corners'); r = rx; }
        return [named(createRect(numAttr(a, 'x'), numAttr(a, 'y'), w, h, { rx: Math.min(r, w / 2, h / 2), ...look() }), 'Rectangle')];
      }
      case 'circle': {
        const r = numAttr(a, 'r');
        if (r <= 0) return [];
        return [named(createEllipse(numAttr(a, 'cx'), numAttr(a, 'cy'), r, r, look()), 'Ellipse')];
      }
      case 'ellipse': {
        const rx = numAttr(a, 'rx'), ry = numAttr(a, 'ry');
        if (rx <= 0 || ry <= 0) return [];
        return [named(createEllipse(numAttr(a, 'cx'), numAttr(a, 'cy'), rx, ry, look()), 'Ellipse')];
      }
      case 'line': {
        const l = look();
        return [named(createPath([node(numAttr(a, 'x1'), numAttr(a, 'y1')), node(numAttr(a, 'x2'), numAttr(a, 'y2'))], false, { fill: null, stroke: l.stroke }), 'Line')];
      }
      case 'polyline': case 'polygon': {
        const nums = (a.points ?? '').split(/[\s,]+/).filter(Boolean).map(parseFloat);
        if (nums.length < 4 || nums.some((v) => !isFinite(v))) { this.warn(`Skipped ${tag} with invalid points`); return []; }
        const pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push(node(nums[i], nums[i + 1]));
        const closed = tag === 'polygon';
        const l = look();
        return [named(createPath(pts, closed, { fill: l.fill, stroke: l.stroke }), closed ? 'Polygon' : 'Polyline')];
      }
      case 'path': {
        let subs;
        try { subs = parsePathData(a.d ?? ''); } catch (e) {
          this.warn(`Skipped a malformed path: ${(e as Error).message}`);
          return [];
        }
        const l = look();
        if (subs.length === 0) return [];
        const [first, ...rest] = subs;
        return [named(createPath(first.nodes, first.closed, { fill: l.fill, stroke: l.stroke, extra: rest, fillRule: st.evenodd ? 'evenodd' : 'nonzero' }), rest.length ? 'Compound path' : 'Path')];
      }
      case 'defs': case 'title': case 'desc': case 'metadata': case 'linearGradient': case 'radialGradient': case 'style': case 'clipPath': case 'mask':
        if (tag === 'style') this.warn('CSS <style> blocks are ignored');
        if (tag === 'mask') this.warn('<mask> is not supported yet and was ignored');
        return [];
      default:
        this.warn(`<${tag}> elements are not supported yet and were skipped`);
        return [];
    }
  }
}

/** Parses an SVG file into a new document. Throws Error("…") for input that is not usable SVG. */
export function importSvg(text: string, name = 'Imported SVG'): SvgImportResult {
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@_', allowBooleanAttributes: true, processEntities: true });
  let tree: XNode[];
  try {
    tree = parser.parse(text) as XNode[];
  } catch (e) {
    throw new Error(`Could not read SVG: ${(e as Error).message}`, { cause: e });
  }
  const svg = tree.find((x) => tagOf(x) === 'svg');
  if (!svg) throw new Error('Not an SVG file (no <svg> root element)');
  const a = attrsOf(svg);
  const imp = new Importer();
  imp.collectDefs(childrenOf(svg));

  let vb: number[] | null = null;
  if (a.viewBox) {
    const v = a.viewBox.split(/[\s,]+/).filter(Boolean).map(parseFloat);
    if (v.length === 4 && v.every(isFinite) && v[2] > 0 && v[3] > 0) vb = v;
  }
  const width = length(a.width) ?? vb?.[2] ?? 800;
  const height = length(a.height) ?? vb?.[3] ?? 600;
  if (!(width > 0 && height > 0) || width > 1e6 || height > 1e6) throw new Error('SVG has an invalid size');
  const root = vb ? multiply(scale(width / vb[2], height / vb[3]), translate(-vb[0], -vb[1])) : IDENTITY;

  const doc = createDocument(name, width, height);
  doc.artboards = [createArtboard('Artboard 1', 0, 0, width, height, null)];
  doc.layers = [];
  const base = imp.style(DEFAULT_STYLE, a);
  const loose: Element[] = [];
  const kids = childrenOf(svg);
  for (const k of kids) {
    const ka = attrsOf(k);
    if (tagOf(k) === 'rect' && ka['data-role'] === 'artboard-background') {
      const c = parseColor(ka.fill ?? '');
      if (c) doc.artboards[0].background = c.color;
      continue;
    }
    if (tagOf(k) === 'g' && ka['data-layer']) {
      const layer: Layer = createLayer(ka['data-name'] ?? 'Layer');
      layer.locked = !!ka['data-locked'];
      layer.children = childrenOf(k).flatMap((c) => imp.convert(c, imp.style(base, ka)));
      doc.layers.push(layer);
    } else loose.push(...imp.convert(k, base));
  }
  // Re-express the viewBox mapping on top-level objects.
  const bake = (els: Element[]) => els.forEach((e) => { e.transform = multiply(root, e.transform); });
  doc.layers.forEach((l) => bake(l.children));
  bake(loose);
  if (loose.length > 0 || doc.layers.length === 0) {
    const layer = createLayer('Layer 1');
    layer.children = loose;
    doc.layers.unshift(layer);
  }
  return { doc, warnings: [...imp.warnings] };
}

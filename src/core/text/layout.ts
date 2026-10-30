import { flattenPath, pathBounds } from '../geometry/path';
import { multiply } from '../geometry/matrix';
import type { Matrix, Rect, Vec } from '../geometry/types';
import type { Subpath, TextElement } from '../document/types';
import * as hb from 'harfbuzzjs';
import { fonts, type LoadedFace } from './fonts';

export interface LayoutLine {
  text: string;
  /** Advance width in local units (without trailing tracking). */
  width: number;
  /** Left start x of the line (after alignment) and its baseline y. */
  x: number;
  baseline: number;
}

export interface TextLayout {
  subpaths: Subpath[];
  /** Selection frame: the advance box of the text (not the tight ink bounds). */
  box: Rect;
  lines: LayoutLine[];
  /** True when a requested family was unavailable and a substitute was used. */
  substituted: boolean;
  /** Glyph placements, useful for tests and caret logic. */
  glyphCount: number;
}

interface G { face: LoadedFace; gid: number; adv: number; dx: number; dy: number; cluster: number }

/** Hebrew, Arabic, Syriac, Thaana, NKo (U+0590-08FF) plus Hebrew/Arabic presentation forms. */
const RTL_RANGES: [number, number][] = [[0x590, 0x8ff], [0xfb1d, 0xfdff], [0xfe70, 0xfeff]];
const RTL_RE = { test: (c: string) => { const cp = c.codePointAt(0) ?? 0; return RTL_RANGES.some(([a, b]) => cp >= a && cp <= b); } };
const LETTER_RE = /\p{L}/u;
const isRtlChar = (c: string) => RTL_RE.test(c);
const SKEW = Math.tan((12 * Math.PI) / 180);

function shapeWith(face: LoadedFace, text: string, rtl: boolean): G[] {
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  buf.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
  hb.shape(face.font, buf);
  const infos = buf.getGlyphInfos(), pos = buf.getGlyphPositions();
  return infos.map((i, k) => ({ face, gid: i.codepoint, adv: pos[k].xAdvance, dx: pos[k].xOffset, dy: pos[k].yOffset, cluster: i.cluster }));
}

/** Shapes a same-direction run, falling back to later faces for characters the face lacks. Returns glyphs in visual order. */
function shapeRun(text: string, rtl: boolean, faces: LoadedFace[], fi: number): G[] {
  const glyphs = shapeWith(faces[fi], text, rtl);
  if (fi >= faces.length - 1 || !glyphs.some((g) => g.gid === 0)) return glyphs;
  const bad = new Uint8Array(text.length);
  const clusters = [...new Set(glyphs.map((g) => g.cluster))].sort((a, b) => a - b);
  for (const g of glyphs) {
    if (g.gid !== 0) continue;
    const next = clusters.find((c) => c > g.cluster) ?? text.length;
    for (let i = g.cluster; i < next; i++) bad[i] = 1;
  }
  const segs: { text: string; bad: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = segs[segs.length - 1];
    if (last && last.bad === !!bad[i]) last.text += text[i]; else segs.push({ text: text[i], bad: !!bad[i] });
  }
  const parts = segs.map((s) => (s.bad ? shapeRun(s.text, rtl, faces, fi + 1) : shapeWith(faces[fi], s.text, rtl)));
  return (rtl ? parts.reverse() : parts).flat();
}

/** Splits a line into directional runs (simplified bidi: strong RTL letters vs everything else; neutrals join the previous run). */
function itemize(text: string): { text: string; rtl: boolean }[] {
  const chars = [...text];
  const firstStrong = chars.find((c) => isRtlChar(c) || LETTER_RE.test(c));
  const base = firstStrong ? isRtlChar(firstStrong) : false;
  const runs: { text: string; rtl: boolean }[] = [];
  let cur = base;
  for (const c of chars) {
    if (isRtlChar(c)) cur = true; else if (LETTER_RE.test(c)) cur = false;
    const last = runs[runs.length - 1];
    if (last && last.rtl === cur) last.text += c; else runs.push({ text: c, rtl: cur });
  }
  return base ? runs.reverse() : runs; // RTL paragraphs read right-to-left: later runs sit further left
}

function shapeLine(text: string, primary: LoadedFace): G[] {
  const faces = [primary, ...fonts.fallbacksFor(primary)];
  return itemize(text).flatMap((r) => shapeRun(r.text, r.rtl, faces, 0));
}

function lineWidth(glyphs: G[], size: number, trackPx: number): number {
  let w = 0;
  for (const g of glyphs) w += (g.adv * size) / g.face.upem + trackPx;
  return glyphs.length ? w - trackPx : 0;
}

/** Greedy word wrap using real shaped widths. A single word wider than the box is split between characters. */
function wrap(paragraph: string, maxW: number, primary: LoadedFace, size: number, trackPx: number): string[] {
  if (paragraph === '') return [''];
  const width = (t: string) => lineWidth(shapeLine(t, primary), size, trackPx);
  const words = paragraph.match(/\S+\s*|\s+/g) ?? [paragraph];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && width((cur + w).trimEnd()) > maxW) { lines.push(cur.trimEnd()); cur = ''; }
    if (width(w.trimEnd()) > maxW) {
      for (const ch of [...w]) {
        if (cur && width(cur + ch) > maxW) { lines.push(cur); cur = ''; }
        cur += ch;
      }
    } else cur += w;
  }
  lines.push(cur.trimEnd());
  return lines;
}

function emitGlyph(out: Subpath[], face: LoadedFace, gid: number, m: Matrix): void {
  for (const sp of fonts.glyphOutline(face, gid)) {
    out.push({
      closed: sp.closed,
      nodes: sp.nodes.map((n) => ({
        x: m[0] * n.x + m[2] * n.y + m[4], y: m[1] * n.x + m[3] * n.y + m[5],
        inX: m[0] * n.inX + m[2] * n.inY, inY: m[1] * n.inX + m[3] * n.inY,
        outX: m[0] * n.outX + m[2] * n.outY, outY: m[1] * n.outX + m[3] * n.outY,
      })),
    });
  }
}

interface PathSampler { length: number; at(s: number): { p: Vec; angle: number } }
function sampler(sp: Subpath): PathSampler | null {
  const pts = flattenPath(sp.nodes, sp.closed, 0.2);
  if (sp.closed && pts.length > 1) pts.push(pts[0]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const length = cum[cum.length - 1];
  if (!(length > 0)) return null;
  return {
    length,
    at(s) {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const seg = cum[i] - cum[i - 1] || 1;
      const t = Math.min(1, Math.max(0, (s - cum[i - 1]) / seg));
      const a = pts[i - 1], b = pts[i];
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    },
  };
}

const cache = new WeakMap<TextElement, { version: number; layout: TextLayout }>();

export function layoutText(el: TextElement): TextLayout {
  const hit = cache.get(el);
  if (hit && hit.version === fonts.version) return hit.layout;
  const layout = compute(el);
  cache.set(el, { version: fonts.version, layout });
  return layout;
}

function compute(el: TextElement): TextLayout {
  const size = Math.max(0.01, el.fontSize);
  const primary = fonts.resolve({ family: el.fontFamily, weight: el.fontWeight, italic: el.italic });
  const text = el.content.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\p{Cc}/gu, (c) => (c === '\n' ? c : ''));
  if (!primary) {
    const lines = text.split('\n');
    const w = Math.max(0, ...lines.map((l) => l.length)) * size * 0.55;
    return { subpaths: [], box: { x: el.x, y: el.y - size * 0.95, w, h: lines.length * size * el.lineHeight }, lines: [], substituted: true, glyphCount: 0 };
  }
  const substituted = primary.family.toLowerCase() !== el.fontFamily.trim().toLowerCase();
  const trackPx = (size * el.tracking) / 1000;
  const skew = el.italic && !primary.italic ? SKEW : 0;
  const lh = size * el.lineHeight;
  const onPath = el.path ? sampler(el.path) : null;
  const areaW = el.width > 0 && !el.path ? el.width : 0;

  let lineTexts: string[] = [];
  for (const para of (onPath ? text.replace(/\n/g, ' ') : text).split('\n')) lineTexts.push(...(areaW ? wrap(para, areaW, primary, size, trackPx) : [para]));
  if (onPath) lineTexts = [lineTexts.join(' ')];

  const subpaths: Subpath[] = [];
  const lines: LayoutLine[] = [];
  let glyphCount = 0;
  let maxW = 0;
  let missing = false;
  lineTexts.forEach((lt, li) => {
    const glyphs = shapeLine(lt, primary);
    glyphCount += glyphs.length;
    if (glyphs.some((g) => g.gid === 0)) missing = true;
    const w = lineWidth(glyphs, size, trackPx);
    maxW = Math.max(maxW, w);
    const baseline = el.y + li * lh;
    // Alignment: within the box for area text, around/after the anchor for point text.
    const x0 = areaW
      ? el.x + (el.align === 'center' ? (areaW - w) / 2 : el.align === 'right' ? areaW - w : 0)
      : el.x - (el.align === 'center' ? w / 2 : el.align === 'right' ? w : 0);
    lines.push({ text: lt, width: w, x: x0, baseline });

    let pen = 0;
    for (const g of glyphs) {
      const gs = size / g.face.upem;
      const adv = g.adv * gs;
      if (onPath) {
        const start = el.pathOffset * onPath.length - (el.align === 'center' ? w / 2 : el.align === 'right' ? w : 0);
        let s = start + pen + adv / 2;
        if (el.path!.closed) s = ((s % onPath.length) + onPath.length) % onPath.length;
        if (s >= 0 && s <= onPath.length) {
          const { p, angle } = onPath.at(s);
          const c = Math.cos(angle), sn = Math.sin(angle);
          const L: Matrix = [gs, 0, gs * skew, -gs, 0, 0];
          const R: Matrix = [c, sn, -sn, c, 0, 0];
          const m = multiply(R, L);
          const ox = p.x - c * (adv / 2) + c * g.dx * gs + sn * g.dy * gs, oy = p.y - sn * (adv / 2) + sn * g.dx * gs - c * g.dy * gs;
          emitGlyph(subpaths, g.face, g.gid, [m[0], m[1], m[2], m[3], ox, oy]);
        }
      } else {
        emitGlyph(subpaths, g.face, g.gid, [gs, 0, gs * skew, -gs, x0 + pen + g.dx * gs, baseline - g.dy * gs]);
      }
      pen += adv + trackPx;
    }
  });

  let box: Rect;
  if (onPath) {
    box = pathBounds(el.path!.nodes, el.path!.closed) ?? { x: el.x, y: el.y, w: 0, h: 0 };
  } else {
    const left = areaW ? el.x : lines.length ? Math.min(...lines.map((l) => l.x)) : el.x;
    const w = areaW || maxW;
    const top = el.y - (primary.ascender * size) / primary.upem;
    const bottom = el.y + (lines.length - 1) * lh - (primary.descender * size) / primary.upem;
    box = { x: left, y: top, w, h: bottom - top };
  }
  if (missing) fonts.reportMissing();
  return { subpaths, box, lines, substituted, glyphCount };
}

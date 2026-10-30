import { elementBounds, elementNodes, type Artboard, type Element, type Paint, type Stroke, type VDocument } from '../core/document';
import type { PathNode, Rect } from '../core/geometry/types';
import { rectsIntersect, transformRect, IDENTITY } from '../core/geometry/matrix';

/**
 * Canvas2D renderer. Pure function of (document, context): no DOM access beyond the
 * context passed in, so the same code renders on screen, to PNG export and in Node tests.
 */

export interface OffscreenLike {
  canvas: { width: number; height: number };
  ctx: CanvasRenderingContext2D;
}

export interface RenderOptions {
  /** Creates a scratch canvas for group opacity compositing. Without it opacity is applied per-shape. */
  makeCanvas?: (w: number, h: number) => OffscreenLike;
  /** World-space rect that is visible; elements outside are skipped. */
  cull?: Rect;
}

export const rgba = (p: Paint): string => {
  const r = parseInt(p.color.slice(1, 3), 16), g = parseInt(p.color.slice(3, 5), 16), b = parseInt(p.color.slice(5, 7), 16);
  return p.alpha >= 1 ? p.color : `rgba(${r},${g},${b},${p.alpha})`;
};

export function tracePath(ctx: CanvasRenderingContext2D, nodes: readonly PathNode[], closed: boolean): void {
  if (nodes.length === 0) return;
  ctx.moveTo(nodes[0].x, nodes[0].y);
  const count = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    if (a.outX === 0 && a.outY === 0 && b.inX === 0 && b.inY === 0) ctx.lineTo(b.x, b.y);
    else ctx.bezierCurveTo(a.x + a.outX, a.y + a.outY, b.x + b.inX, b.y + b.inY, b.x, b.y);
  }
  if (closed) ctx.closePath();
}

function applyStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  ctx.strokeStyle = rgba(s.paint);
  ctx.lineWidth = s.width;
  ctx.lineCap = s.cap;
  ctx.lineJoin = s.join;
  ctx.miterLimit = s.miterLimit;
  ctx.setLineDash(s.dash.length ? (s.dash.length % 2 ? [...s.dash, ...s.dash] : s.dash) : []);
}

const boundsCache = new WeakMap<Element, Rect | null>();
function cachedBounds(el: Element): Rect | null {
  if (boundsCache.has(el)) return boundsCache.get(el) ?? null;
  const b = elementBounds(el, true);
  const padded = b && el.type !== 'group' ? { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 } : b;
  boundsCache.set(el, padded);
  return padded;
}

function drawShape(ctx: CanvasRenderingContext2D, el: Exclude<Element, { type: 'group' }>): void {
  ctx.beginPath();
  if (el.type === 'rect' && el.rx === 0) ctx.rect(el.x, el.y, el.w, el.h);
  else tracePath(ctx, elementNodes(el), el.type !== 'path' || el.closed);
  if (el.fill && (el.type !== 'path' || el.closed || el.nodes.length > 2)) {
    ctx.fillStyle = rgba(el.fill);
    ctx.fill('nonzero');
  }
  if (el.stroke && el.stroke.width > 0) {
    applyStroke(ctx, el.stroke);
    ctx.stroke();
  }
}

function needsCompositing(el: Element): boolean {
  if (el.opacity >= 1) return false;
  return el.type === 'group' || (!!el.fill && !!el.stroke);
}

function drawElement(ctx: CanvasRenderingContext2D, el: Element, opts: RenderOptions, world: Matrix6): void {
  if (!el.visible) return;
  const m = multiply6(world, el.transform);
  if (opts.cull) {
    const b = cachedBounds(el);
    if (b && !rectsIntersect(transformRect(world, b), opts.cull)) return;
  }
  const t = el.transform;
  const composite = needsCompositing(el) && opts.makeCanvas;
  ctx.save();
  if (composite) {
    const off = opts.makeCanvas!(ctx.canvas.width, ctx.canvas.height);
    off.ctx.setTransform(ctx.getTransform());
    off.ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
    drawBody(off.ctx, el, opts, m);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha *= el.opacity;
    ctx.drawImage(off.canvas as unknown as CanvasImageSource, 0, 0);
  } else {
    ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
    if (el.opacity < 1) ctx.globalAlpha *= el.opacity;
    drawBody(ctx, el, opts, m);
  }
  ctx.restore();
}

function drawBody(ctx: CanvasRenderingContext2D, el: Element, opts: RenderOptions, m: Matrix6): void {
  if (el.type === 'group') for (const c of el.children) drawElement(ctx, c, opts, m);
  else drawShape(ctx, el);
}

type Matrix6 = [number, number, number, number, number, number];
const multiply6 = (a: Matrix6, b: Matrix6): Matrix6 => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

/** Draws all visible layers using the context's current transform (document → device). */
export function drawLayers(ctx: CanvasRenderingContext2D, doc: VDocument, opts: RenderOptions = {}): void {
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    for (const el of layer.children) drawElement(ctx, el, opts, IDENTITY);
  }
}

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  /** CSS pixel size of the viewport. */
  width: number;
  height: number;
  dpr: number;
  activeArtboardId?: string | null;
  showArtboardLabels?: boolean;
  theme?: { workspace: string; label: string };
}

/** Draws the editor view: workspace, artboards and content. Clears the canvas first. */
export function renderView(ctx: CanvasRenderingContext2D, doc: VDocument, view: ViewState, opts: RenderOptions = {}): void {
  const { zoom, panX, panY, dpr } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = view.theme?.workspace ?? '#2b2b2b';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY);
  const visible: Rect = { x: -panX / zoom, y: -panY / zoom, w: view.width / zoom, h: view.height / zoom };

  for (const a of doc.artboards) {
    drawArtboardBackground(ctx, a, zoom, view.theme?.label ?? '#9a9a9a', a.id === view.activeArtboardId, view.showArtboardLabels !== false);
  }
  drawLayers(ctx, doc, { ...opts, cull: visible });
}

function drawArtboardBackground(ctx: CanvasRenderingContext2D, a: Artboard, zoom: number, labelColor: string, active: boolean, label: boolean): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 12 / zoom;
  ctx.fillStyle = a.background ?? '#ffffff';
  if (a.background === null) {
    // Transparent artboard: show a checkerboard so transparency is visible, but never exported.
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.shadowColor = 'transparent';
    const cell = 8 / zoom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, a.w, a.h);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.fillStyle = '#d8d8d8';
    for (let y = 0, r = 0; y < a.h; y += cell, r++) {
      for (let x = (r % 2) * cell; x < a.w; x += cell * 2) ctx.fillRect(a.x + x, a.y + y, Math.min(cell, a.w - x), Math.min(cell, a.h - y));
    }
    ctx.restore();
  } else ctx.fillRect(a.x, a.y, a.w, a.h);
  ctx.restore();
  if (active) {
    ctx.strokeStyle = '#4d9cff';
    ctx.lineWidth = 1 / zoom;
    ctx.strokeRect(a.x, a.y, a.w, a.h);
  }
  if (label) {
    ctx.fillStyle = labelColor;
    ctx.font = `${12 / zoom}px system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(a.name, a.x, a.y - 4 / zoom);
  }
}

/**
 * Renders one artboard to an already-sized canvas context at `scale` device pixels per document unit.
 * Content outside the artboard is clipped. A null background leaves the pixels fully transparent.
 */
export function renderArtboard(ctx: CanvasRenderingContext2D, doc: VDocument, artboard: Artboard, scale: number, opts: RenderOptions = {}, options: { transparent?: boolean; pixelWidth?: number; pixelHeight?: number } = {}): void {
  const w = options.pixelWidth ?? Math.round(artboard.w * scale);
  const h = options.pixelHeight ?? Math.round(artboard.h * scale);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  // Exact pixel mapping: scale each axis so the rounded pixel size covers the artboard exactly.
  const sx = w / artboard.w, sy = h / artboard.h;
  ctx.setTransform(sx, 0, 0, sy, -artboard.x * sx, -artboard.y * sy);
  if (artboard.background && !options.transparent) {
    ctx.fillStyle = artboard.background;
    ctx.fillRect(artboard.x, artboard.y, artboard.w, artboard.h);
  }
  drawLayers(ctx, doc, opts);
  ctx.restore();
}

import type { Artboard, VDocument } from '../core/document';
import { renderArtboard, type OffscreenLike } from './canvas2d';

export type CanvasFactory = (w: number, h: number) => OffscreenLike;

export interface RasterOptions {
  /** Pixels per document unit. Ignored when width/height are given. */
  scale?: number;
  /** Target pixel width (height follows aspect ratio unless also given). */
  width?: number;
  height?: number;
  /** Ignore the artboard background and export with alpha. */
  transparent?: boolean;
}

export const MAX_RASTER_PIXELS = 16384 * 16384;

export function rasterSize(artboard: Artboard, o: RasterOptions): { w: number; h: number; scale: number } {
  let scale = o.scale ?? 1;
  if (o.width && o.height) {
    return { w: Math.round(o.width), h: Math.round(o.height), scale: o.width / artboard.w };
  }
  if (o.width) scale = o.width / artboard.w;
  else if (o.height) scale = o.height / artboard.h;
  const w = Math.max(1, Math.round(artboard.w * scale));
  const h = Math.max(1, Math.round(artboard.h * scale));
  return { w, h, scale };
}

/** Rasterises an artboard into a fresh canvas created by `make`. Throws if the output would be unreasonably large. */
export function rasterizeArtboard(doc: VDocument, artboard: Artboard, make: CanvasFactory, o: RasterOptions = {}): OffscreenLike {
  const { w, h } = rasterSize(artboard, o);
  if (!isFinite(w) || !isFinite(h) || w < 1 || h < 1) throw new Error('Invalid export size');
  if (w > 16384 || h > 16384 || w * h > MAX_RASTER_PIXELS) throw new Error(`Export size ${w}×${h} is too large`);
  const target = make(w, h);
  renderArtboard(target.ctx, doc, artboard, w / artboard.w, { makeCanvas: make }, { transparent: o.transparent, pixelWidth: w, pixelHeight: h });
  return target;
}

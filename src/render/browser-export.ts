import type { Artboard, VDocument } from '../core/document';
import { setJpegPpi, setPngPpi } from '../core/io';
import { rasterizeArtboard, type CanvasFactory, type RasterOptions } from './export';

const make: CanvasFactory = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
};

export interface ImageExportOptions extends RasterOptions {
  format?: 'png' | 'jpeg';
  /** 0..1, JPEG only. */
  quality?: number;
  /** Written into the file so print software reads the intended physical size. */
  ppi?: number;
}

/** Renders an artboard to PNG or JPEG bytes in the browser/Electron renderer. */
export async function exportImage(doc: VDocument, artboard: Artboard, opts: ImageExportOptions = {}): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const jpeg = opts.format === 'jpeg';
  const off = rasterizeArtboard(doc, artboard, make, { ...opts, flatten: jpeg ? (opts.transparent || !artboard.background ? '#ffffff' : (artboard.background ?? '#ffffff')) : undefined, transparent: jpeg ? false : opts.transparent });
  const canvas = off.canvas as unknown as HTMLCanvasElement;
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, jpeg ? 'image/jpeg' : 'image/png', jpeg ? opts.quality ?? 0.92 : undefined));
  if (!blob) throw new Error('The browser could not encode the image (it may be too large)');
  let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
  if (opts.ppi) bytes = jpeg ? setJpegPpi(bytes, opts.ppi) : setPngPpi(bytes, opts.ppi);
  return { bytes, width: canvas.width, height: canvas.height };
}

/** Kept for existing callers/tests. */
export const exportPng = (doc: VDocument, artboard: Artboard, opts: RasterOptions = {}) => exportImage(doc, artboard, { ...opts, format: 'png' });

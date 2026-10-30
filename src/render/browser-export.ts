import type { Artboard, VDocument } from '../core/document';
import { rasterizeArtboard, type CanvasFactory, type RasterOptions } from './export';

const make: CanvasFactory = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
};

/** Renders an artboard to PNG bytes in the browser/Electron renderer. */
export async function exportPng(doc: VDocument, artboard: Artboard, opts: RasterOptions = {}): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const off = rasterizeArtboard(doc, artboard, make, opts);
  const canvas = off.canvas as unknown as HTMLCanvasElement;
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('The browser could not encode the PNG (image may be too large)');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

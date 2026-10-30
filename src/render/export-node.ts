import { createCanvas } from '@napi-rs/canvas';
import type { Artboard, VDocument } from '../core/document';
import { setJpegPpi, setPngPpi } from '../core/io';
import { rasterizeArtboard, type CanvasFactory } from './export';

/** Node (CLI / tests / unattended batch) implementation of image export, same renderer as the app. */
export const nodeCanvas: CanvasFactory = (w, h) => {
  const canvas = createCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D };
};

export async function exportImage(doc: VDocument, ab: Artboard, o: { format: 'png' | 'jpeg'; scale?: number; width?: number; transparent: boolean; quality: number; ppi: number; bleed?: number }): Promise<Uint8Array> {
  const jpeg = o.format === 'jpeg';
  const off = rasterizeArtboard(doc, ab, nodeCanvas, { scale: o.scale, width: o.width, transparent: jpeg ? false : o.transparent, bleed: o.bleed, flatten: jpeg ? (ab.background ?? '#ffffff') : undefined });
  const c = off.canvas as unknown as { toBuffer(t: 'image/png'): Buffer; toBuffer(t: 'image/jpeg', q: number): Buffer };
  const bytes: Uint8Array = jpeg ? c.toBuffer('image/jpeg', Math.round(o.quality * 100)) : c.toBuffer('image/png');
  return jpeg ? setJpegPpi(bytes, o.ppi) : setPngPpi(bytes, o.ppi);
}

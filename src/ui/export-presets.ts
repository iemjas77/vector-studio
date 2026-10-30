export type ExportFormat = 'png' | 'jpeg' | 'pdf' | 'svg';

export interface ExportPreset {
  id: string;
  label: string;
  format: ExportFormat;
  /** Fixed output width in px (raster); otherwise `scale` is used. */
  width?: number;
  scale?: number;
  transparent?: boolean;
  quality?: number;
  ppi?: number;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'pod-tee', label: 'Print-on-demand T-shirt – PNG 4500 px wide, transparent, 300 ppi', format: 'png', width: 4500, transparent: true, ppi: 300 },
  { id: 'web-1x', label: 'Web – PNG 1×', format: 'png', scale: 1, ppi: 72 },
  { id: 'web-2x', label: 'Web – PNG 2× (retina)', format: 'png', scale: 2, ppi: 144 },
  { id: 'jpeg-hi', label: 'Photo-style – JPEG 92 %, 300 ppi', format: 'jpeg', scale: 1, quality: 0.92, ppi: 300 },
  { id: 'thumb', label: 'Thumbnail – PNG 512 px wide', format: 'png', width: 512, ppi: 72 },
  { id: 'vector-pdf', label: 'Vector – PDF', format: 'pdf' },
  { id: 'vector-svg', label: 'Vector – SVG', format: 'svg' },
];

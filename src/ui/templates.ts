export interface DocTemplate {
  id: string;
  label: string;
  width: number;
  height: number;
  transparent: boolean;
  ppi: number;
  /** Guides to add, in document units. */
  guides: { axis: 'v' | 'h'; pos: number }[];
}

const margin = (w: number, h: number, f = 0.05) => [
  { axis: 'v' as const, pos: w / 2 }, { axis: 'v' as const, pos: Math.round(w * f) }, { axis: 'v' as const, pos: w - Math.round(w * f) },
  { axis: 'h' as const, pos: Math.round(h * f) }, { axis: 'h' as const, pos: h - Math.round(h * f) },
];

export const TEMPLATES: DocTemplate[] = [
  { id: 'blank', label: 'Blank (custom size)', width: 1920, height: 1080, transparent: false, ppi: 72, guides: [] },
  { id: 'pod-tee', label: 'Print-on-demand T-shirt (4500×5400, transparent, 300 ppi, centre + safe-area guides)', width: 4500, height: 5400, transparent: true, ppi: 300, guides: [...margin(4500, 5400), { axis: 'h', pos: 600 }] },
  { id: 'pod-square', label: 'Print-on-demand square (3000×3000, transparent, 300 ppi)', width: 3000, height: 3000, transparent: true, ppi: 300, guides: margin(3000, 3000) },
  { id: 'pod-mug', label: 'Mug wrap (2700×1100, transparent, 300 ppi)', width: 2700, height: 1100, transparent: true, ppi: 300, guides: margin(2700, 1100) },
  { id: 'web-hd', label: 'Web HD (1920×1080)', width: 1920, height: 1080, transparent: false, ppi: 72, guides: [] },
  { id: 'icon', label: 'App icon (1024×1024, transparent)', width: 1024, height: 1024, transparent: true, ppi: 72, guides: margin(1024, 1024, 0.1) },
];

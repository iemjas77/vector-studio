import { elementBounds, paintVisible, type Artboard, type Element, type VDocument } from '../document';
import { rectsIntersect } from '../geometry/matrix';

export interface ExportIssue {
  level: 'warn' | 'info';
  text: string;
}

/** Pre-flight checks shown in the export dialog. Cheap, geometric, never blocking. */
export function checkExport(doc: VDocument, ab: Artboard, opts: { format: 'png' | 'jpeg' | 'pdf' | 'svg'; transparent: boolean; width?: number; height?: number; ppi?: number }): ExportIssue[] {
  const issues: ExportIssue[] = [];
  const rect = { x: ab.x, y: ab.y, w: ab.w, h: ab.h };
  let visible = 0, clipped = 0, translucent = 0, withEffects = 0, withBlend = 0;
  const walk = (els: Element[]) => {
    for (const el of els) {
      if (!el.visible) continue;
      const b = elementBounds(el);
      if (el.effects?.length) withEffects++;
      if (el.blend && el.blend !== 'normal') withBlend++;
      if (el.type === 'group') { walk(el.children); continue; }
      if (!b || !rectsIntersect(b, rect)) continue;
      visible++;
      if (b.x < rect.x - 1e-6 || b.y < rect.y - 1e-6 || b.x + b.w > rect.x + rect.w + 1e-6 || b.y + b.h > rect.y + rect.h + 1e-6) clipped++;
      const partial = el.opacity < 1 || (paintVisible(el.fill) && (el.fill!.type === 'solid' ? el.fill!.alpha < 1 : el.fill!.stops.some((s) => s.alpha < 1)));
      if (partial) translucent++;
    }
  };
  for (const l of doc.layers) if (l.visible) walk(l.children);
  if (visible === 0 && !ab.background) issues.push({ level: 'warn', text: 'This artboard has no visible content and no background; the export will be empty.' });
  if (clipped > 0) issues.push({ level: 'warn', text: `${clipped} object${clipped > 1 ? 's extend' : ' extends'} beyond the artboard and will be cut off.` });
  if (translucent > 0 && (opts.format === 'png' || opts.format === 'jpeg')) issues.push({ level: 'info', text: `${translucent} object${translucent > 1 ? 's use' : ' uses'} transparency; some print-on-demand services reject semi-transparent pixels.` });
  if (withEffects > 0 && opts.format === 'pdf') issues.push({ level: 'warn', text: `${withEffects} object(s) use live effects (blur, shadow, glow). PDF cannot represent them, so they will be missing in the PDF. Export PNG/SVG instead, or remove the effects.` });
  if (withEffects > 0 && opts.format === 'svg') issues.push({ level: 'info', text: `${withEffects} object(s) use live effects, exported as SVG filters (other editors may render them slightly differently and cannot edit them as effects).` });
  if (withBlend > 0 && opts.format === 'svg') issues.push({ level: 'info', text: `${withBlend} object(s) use blend modes, exported as CSS mix-blend-mode (not every SVG viewer supports it).` });
  if (opts.format === 'jpeg' && (opts.transparent || !ab.background)) issues.push({ level: 'info', text: 'JPEG has no transparency; transparent areas are exported on white.' });
  if (opts.format === 'pdf') issues.push({ level: 'info', text: 'PDF export is vector RGB. Gradient transparency and group-level opacity are simplified; no CMYK or bleed yet.' });
  if (opts.format === 'svg' && doc.layers.some((l) => l.visible && l.children.some((e) => e.type === 'group' && e.clip))) issues.push({ level: 'info', text: 'Clipping masks are exported as SVG clipPath elements.' });
  return issues;
}

export function physicalSize(w: number, h: number, ppi: number): { inW: number; inH: number; cmW: number; cmH: number } {
  return { inW: w / ppi, inH: h / ppi, cmW: (w / ppi) * 2.54, cmH: (h / ppi) * 2.54 };
}

import { z } from 'zod';
import type { Editor } from '../editor/editor';
import {
  cleanupDocument, DEFAULT_CLEANUP, reduceColors, replaceColor, resizeArtboardWithContent, solid, type Artboard, type CleanupOptions, type VDocument,
} from '../core/document';
import { exportPdf, exportSvg, setJpegPpi, setPngPpi } from '../core/io';
import { BLEND_MODES } from '../core/document';

/**
 * Recordable steps. Each step is a SEMANTIC document command (never mouse coordinates). The UI performs these through
 * the same executor that Actions playback and batch use, so a recorded step is by construction what the user did.
 */

export interface ExportedFile { name: string; data: Uint8Array | string; mime: string }

/** Environment a step runs in. `rasterize` is supplied by the host (browser canvas or Node canvas). */
export interface StepContext {
  editor: Editor;
  /** Base name for outputs (document name without extension). */
  baseName: string;
  rasterize?: (doc: VDocument, artboard: Artboard, o: { format: 'png' | 'jpeg'; scale?: number; width?: number; transparent: boolean; quality: number; ppi: number }) => Promise<Uint8Array>;
  emit(file: ExportedFile): void;
  /** Called by `prompt` steps; resolves with the user's go-ahead or rejects to cancel. Absent in unattended runs. */
  prompt?: (message: string) => Promise<void>;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const mode = z.enum(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']);
const dmode = z.enum(['hcenters', 'vcenters', 'hspace', 'vspace']);
const effectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('blur'), radius: z.number().min(0).max(1000) }),
  z.object({ type: z.literal('dropShadow'), dx: z.number(), dy: z.number(), blur: z.number().min(0).max(1000), color: hex, alpha: z.number().min(0).max(1) }),
  z.object({ type: z.literal('outerGlow'), blur: z.number().min(0).max(1000), color: hex, alpha: z.number().min(0).max(1) }),
]);
const types = z.array(z.enum(['rect', 'ellipse', 'path', 'text', 'group']));

export interface StepDef<P = unknown> {
  type: string;
  label: string;
  schema: z.ZodType<P>;
  /** Needs a selection to do anything. */
  needsSelection?: boolean;
  /** Requires user interaction (not allowed in unattended batch). */
  interactive?: boolean;
  /** Produces files rather than changing the document. */
  exports?: boolean;
  run(ctx: StepContext, p: P): void | Promise<void>;
}

const def = <P>(d: StepDef<P>): StepDef<P> => d;
const sel = (ctx: StepContext) => ctx.editor.selection.length;
const needSel = (ctx: StepContext, what: string) => { if (!sel(ctx)) throw new Error(`${what}: nothing is selected (add a "Select All" or "Select by type" step before it)`); };
const artboardsFor = (ed: Editor, name?: string): Artboard[] => {
  const abs = !name || name === 'all' ? ed.doc.artboards : ed.doc.artboards.filter((a) => a.name === name);
  if (!abs.length) throw new Error(`No artboard named "${name}"`);
  return abs;
};
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, '_').trim() || 'artboard';
const fname = (ctx: StepContext, ab: Artboard, suffix: string | undefined, ext: string) => `${ctx.baseName}${ctx.editor.doc.artboards.length > 1 ? '-' + safe(ab.name) : ''}${suffix ?? ''}.${ext}`;

const rasterParams = z.object({ format: z.enum(['png', 'jpeg']), artboard: z.string().optional(), scale: z.number().positive().max(32).optional(), width: z.number().int().min(1).max(16384).optional(), transparent: z.boolean().default(false), quality: z.number().min(0.01).max(1).default(0.92), ppi: z.number().min(1).max(2400).optional(), suffix: z.string().optional() });

export const STEPS: StepDef<any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  def({ type: 'selectAll', label: 'Select All', schema: z.object({}), run: (c) => c.editor.selectAll() }),
  def({ type: 'deselect', label: 'Deselect', schema: z.object({}), run: (c) => c.editor.clearSelection() }),
  def({ type: 'selectByType', label: 'Select by type', schema: z.object({ types }), run: (c, p) => c.editor.selectByType(p.types) }),
  def({ type: 'group', label: 'Group', schema: z.object({}), needsSelection: true, run: (c) => { needSel(c, 'Group'); c.editor.group(); } }),
  def({ type: 'ungroup', label: 'Ungroup', schema: z.object({}), needsSelection: true, run: (c) => { needSel(c, 'Ungroup'); c.editor.ungroup(); } }),
  def({ type: 'makeCompound', label: 'Make Compound Path', schema: z.object({}), needsSelection: true, run: (c) => { needSel(c, 'Make Compound Path'); c.editor.makeCompound(); } }),
  def({ type: 'releaseCompound', label: 'Release Compound Path', schema: z.object({}), needsSelection: true, run: (c) => { needSel(c, 'Release Compound Path'); c.editor.releaseCompound(); } }),
  def({ type: 'makeClip', label: 'Make Clipping Mask', schema: z.object({}), needsSelection: true, run: (c) => { needSel(c, 'Make Clipping Mask'); c.editor.makeClip(); } }),
  def({ type: 'releaseClip', label: 'Release Clipping Mask', schema: z.object({}), needsSelection: true, run: (c) => { needSel(c, 'Release Clipping Mask'); c.editor.releaseClip(); } }),
  def({ type: 'align', label: 'Align', schema: z.object({ mode, toArtboard: z.boolean().default(false) }), needsSelection: true, run: (c, p) => { needSel(c, 'Align'); c.editor.align(p.mode, p.toArtboard); } }),
  def({ type: 'distribute', label: 'Distribute', schema: z.object({ mode: dmode }), needsSelection: true, run: (c, p) => { needSel(c, 'Distribute'); c.editor.distribute(p.mode); } }),
  def({ type: 'boolean', label: 'Pathfinder', schema: z.object({ op: z.enum(['unite', 'subtract', 'intersect', 'exclude']) }), needsSelection: true, run: (c, p) => { needSel(c, 'Pathfinder'); c.editor.boolean(p.op); } }),
  def({ type: 'expandStroke', label: 'Outline Stroke', schema: z.object({}), needsSelection: true, run: (c) => { needSel(c, 'Outline Stroke'); c.editor.expandStrokes(); } }),
  def({ type: 'offsetPath', label: 'Offset Path', schema: z.object({ distance: z.number().refine((v) => v !== 0 && Math.abs(v) <= 5000), join: z.enum(['round', 'miter', 'bevel']).default('round') }), needsSelection: true, run: (c, p) => { needSel(c, 'Offset Path'); c.editor.offsetSelection(p.distance, p.join); } }),
  def({ type: 'createOutlines', label: 'Create Outlines (text)', schema: z.object({}), needsSelection: true, run: (c) => { needSel(c, 'Create Outlines'); c.editor.convertSelectionToPaths(); } }),
  def({ type: 'scaleSelection', label: 'Scale selection (%)', schema: z.object({ percent: z.number().min(0.1).max(10000) }), needsSelection: true, run: (c, p) => { needSel(c, 'Scale'); c.editor.scaleSelection(p.percent); } }),
  def({ type: 'rotate', label: 'Rotate (°)', schema: z.object({ degrees: z.number().min(-360).max(360) }), needsSelection: true, run: (c, p) => { needSel(c, 'Rotate'); c.editor.rotateSelection(p.degrees); } }),
  def({ type: 'shear', label: 'Shear (°)', schema: z.object({ degrees: z.number().min(-85).max(85) }), needsSelection: true, run: (c, p) => { needSel(c, 'Shear'); c.editor.shearSelection(p.degrees); } }),
  def({ type: 'reflect', label: 'Reflect', schema: z.object({ axis: z.enum(['horizontal', 'vertical']) }), needsSelection: true, run: (c, p) => { needSel(c, 'Reflect'); c.editor.reflectSelection(p.axis); } }),
  def({ type: 'scaleXY', label: 'Scale non-uniform (%)', schema: z.object({ x: z.number().min(0.1).max(10000), y: z.number().min(0.1).max(10000) }), needsSelection: true, run: (c, p) => { needSel(c, 'Scale'); c.editor.scaleSelectionXY(p.x, p.y); } }),
  def({ type: 'transformEach', label: 'Transform Each', schema: z.object({ scale: z.number().min(0.1).max(10000).optional(), rotate: z.number().min(-360).max(360).optional(), moveX: z.number().optional(), moveY: z.number().optional() }), needsSelection: true, run: (c, p) => { needSel(c, 'Transform Each'); c.editor.transformEach(p); } }),
  def({ type: 'setBlend', label: 'Set blend mode', schema: z.object({ mode: z.enum(BLEND_MODES) }), needsSelection: true, run: (c, p) => { needSel(c, 'Blend mode'); c.editor.setBlend(p.mode); } }),
  def({ type: 'addEffect', label: 'Add live effect', schema: z.object({ effect: effectSchema }), needsSelection: true, run: (c, p) => { needSel(c, 'Add effect'); c.editor.addEffect(p.effect); } }),
  def({ type: 'clearEffects', label: 'Clear live effects', schema: z.object({}), needsSelection: true, run: (c) => { needSel(c, 'Clear effects'); c.editor.clearEffects(); } }),
  def({ type: 'setFill', label: 'Set fill colour', schema: z.object({ color: hex.nullable(), alpha: z.number().min(0).max(1).default(1) }), needsSelection: true, run: (c, p) => { needSel(c, 'Set fill'); c.editor.setFill(p.color ? solid(p.color, p.alpha) : null); } }),
  def({ type: 'setStroke', label: 'Set stroke', schema: z.object({ color: hex.optional(), width: z.number().min(0).max(1000).optional(), none: z.boolean().optional() }), needsSelection: true, run: (c, p) => { needSel(c, 'Set stroke'); if (p.none) c.editor.updateStroke(null); else c.editor.updateStroke({ ...(p.color ? { paint: solid(p.color) } : {}), ...(p.width !== undefined ? { width: p.width } : {}) }); } }),
  def({ type: 'replaceColor', label: 'Change colour', schema: z.object({ from: hex, to: hex }), run: (c, p) => { c.editor.apply('Replace color', (d) => { replaceColor(d, p.from, p.to); }); } }),
  def({ type: 'reduceColors', label: 'Reduce colours', schema: z.object({ max: z.number().int().min(1).max(256) }), run: (c, p) => { c.editor.apply('Reduce colors', (d) => { reduceColors(d, p.max); }); } }),
  def({ type: 'cleanup', label: 'Clean up vectors', schema: z.object({ options: z.object({ removeHidden: z.boolean(), removeEmptyGroups: z.boolean(), minArea: z.number().min(0), mergeDistance: z.number().min(0), removeInvisible: z.boolean() }).partial().optional() }), run: (c, p) => { c.editor.apply('Clean up', (d) => { cleanupDocument(d, { ...DEFAULT_CLEANUP, ...(p.options as Partial<CleanupOptions>) }); }); } }),
  def({ type: 'resizeArtboard', label: 'Resize artboard', schema: z.object({ artboard: z.string().optional(), width: z.number().positive().max(16384), height: z.number().positive().max(16384), mode: z.enum(['none', 'fit', 'fill']).default('fit') }), run: (c, p) => { const abs = artboardsFor(c.editor, p.artboard); c.editor.apply('Resize artboard', (d) => { for (const a of abs) resizeArtboardWithContent(d, a.id, p.width, p.height, p.mode); }); } }),
  def({ type: 'setBackground', label: 'Artboard background', schema: z.object({ color: hex.nullable() }), run: (c, p) => { c.editor.apply('Background', (d) => d.artboards.forEach((a) => { a.background = p.color; })); } }),
  def({ type: 'renameLayers', label: 'Rename layers', schema: z.object({ pattern: z.string().min(1).max(100) }), run: (c, p) => c.editor.renameLayers(p.pattern) }),
  def({ type: 'exportRaster', label: 'Export PNG/JPEG', exports: true, schema: rasterParams, run: async (c, p) => {
    if (!c.rasterize) throw new Error('This environment cannot rasterise images');
    for (const ab of artboardsFor(c.editor, p.artboard)) {
      const bytes = await c.rasterize(c.editor.doc, ab, { format: p.format, scale: p.scale ?? (p.width ? undefined : 1), width: p.width, transparent: p.transparent, quality: p.quality, ppi: p.ppi ?? c.editor.doc.ppi });
      c.emit({ name: fname(c, ab, p.suffix, p.format === 'jpeg' ? 'jpg' : 'png'), data: bytes, mime: p.format === 'jpeg' ? 'image/jpeg' : 'image/png' });
    }
  } }),
  def({ type: 'exportSvg', label: 'Export SVG', exports: true, schema: z.object({ artboard: z.string().optional(), suffix: z.string().optional() }), run: (c, p) => { for (const ab of artboardsFor(c.editor, p.artboard)) c.emit({ name: fname(c, ab, p.suffix, 'svg'), data: exportSvg(c.editor.doc, ab), mime: 'image/svg+xml' }); } }),
  def({ type: 'exportPdf', label: 'Export PDF', exports: true, schema: z.object({ artboard: z.string().optional(), bleed: z.number().min(0).max(1000).optional(), suffix: z.string().optional() }), run: (c, p) => { const abs = artboardsFor(c.editor, p.artboard); c.emit({ name: `${c.baseName}${p.suffix ?? ''}.pdf`, data: exportPdf(c.editor.doc, abs, { bleed: p.bleed }), mime: 'application/pdf' }); } }),
  def({ type: 'saveCopy', label: 'Save a copy (.vstudio)', exports: true, schema: z.object({ suffix: z.string().default('-copy') }), run: async (c, p) => { const { serializeDocument } = await import('../core/document'); c.emit({ name: `${c.baseName}${p.suffix}.vstudio`, data: serializeDocument(c.editor.doc), mime: 'application/json' }); } }),
  def({ type: 'prompt', label: 'Pause with message', interactive: true, schema: z.object({ message: z.string().min(1).max(300) }), run: async (c, p) => { if (!c.prompt) throw new Error('A "pause with message" step needs a person to continue it'); await c.prompt(p.message); } }),
  def({ type: 'stop', label: 'Stop', schema: z.object({ message: z.string().max(300).optional() }), run: () => { throw new StopAction(); } }),
];

/** Thrown by the `stop` step to end playback cleanly. */
export class StopAction extends Error { constructor() { super('Action stopped by a Stop step'); this.name = 'StopAction'; } }

export const stepDef = (type: string): StepDef | undefined => STEPS.find((s) => s.type === type);

export interface ActionStep { id: string; type: string; params: Record<string, unknown>; enabled: boolean }

export function validateStep(s: { type: string; params: unknown }): { ok: true; params: Record<string, unknown> } | { ok: false; error: string } {
  const d = stepDef(s.type);
  if (!d) return { ok: false, error: `Unknown step "${s.type}"` };
  const r = d.schema.safeParse(s.params ?? {});
  return r.success ? { ok: true, params: r.data as Record<string, unknown> } : { ok: false, error: `${d.label}: ${r.error.issues[0].path.join('.') || 'parameters'} ${r.error.issues[0].message}` };
}

/** Human-readable summary of a step's parameters. */
export function describeStep(s: ActionStep): string {
  const d = stepDef(s.type);
  const p = Object.entries(s.params).filter(([, v]) => v !== undefined && v !== false).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(', ');
  return `${d?.label ?? s.type}${p ? ` (${p})` : ''}`;
}

export function rasterToBytes(bytes: Uint8Array, format: 'png' | 'jpeg', ppi: number): Uint8Array { return format === 'jpeg' ? setJpegPpi(bytes, ppi) : setPngPpi(bytes, ppi); }

/** Default parameters offered when a step is inserted by hand (every one validates against its schema). */
export const STEP_TEMPLATES: Record<string, Record<string, unknown>> = {
  selectAll: {}, deselect: {}, selectByType: { types: ['text'] }, group: {}, ungroup: {}, makeCompound: {}, releaseCompound: {}, makeClip: {}, releaseClip: {},
  align: { mode: 'hcenter', toArtboard: true }, distribute: { mode: 'hspace' }, boolean: { op: 'unite' }, expandStroke: {}, offsetPath: { distance: 5, join: 'round' },
  createOutlines: {}, scaleSelection: { percent: 50 }, setBlend: { mode: 'multiply' }, addEffect: { effect: { type: 'dropShadow', dx: 6, dy: 6, blur: 10, color: '#000000', alpha: 0.5 } }, clearEffects: {}, rotate: { degrees: 90 }, shear: { degrees: 20 }, reflect: { axis: 'horizontal' }, scaleXY: { x: 100, y: 50 }, transformEach: { scale: 80, rotate: 15 }, setFill: { color: '#000000', alpha: 1 }, setStroke: { color: '#000000', width: 2 },
  replaceColor: { from: '#ff0000', to: '#0000ff' }, reduceColors: { max: 6 }, cleanup: {}, resizeArtboard: { width: 4500, height: 5400, mode: 'fit' },
  setBackground: { color: null }, renameLayers: { pattern: 'Layer {n}' }, exportRaster: { format: 'png', width: 4500, transparent: true, quality: 0.92 },
  exportSvg: {}, exportPdf: {}, saveCopy: { suffix: '-copy' }, prompt: { message: 'Check the artwork, then continue' }, stop: {},
};

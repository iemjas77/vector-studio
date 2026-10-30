import { createDocument, getElement, newId, insertCopies, parseDocument, serializeDocument, DocumentFormatError, type Artboard, type VDocument } from '../core/document';
import { exportPdf, exportSvg, importSvg } from '../core/io';
import { Editor } from '../editor/editor';
import type { ToolId } from '../editor/types';
import { exportImage } from '../render/browser-export';
import { platform } from '../platform';
import { useUi } from './store';
import { actions } from './actions-service';
import { layout } from './layout-service';
import { eventToShortcut, Keymap, normalizeShortcut, type KeyEventLike } from './keymap';
import type { Workspace } from './workspace';

export interface App {
  ws: Workspace;
  readonly ed: Editor;
}

export interface Command {
  id: string;
  label: string;
  /** Display + matching string, e.g. "Ctrl+Shift+Z". Letters are matched case-insensitively. */
  shortcut?: string;
  enabled?(app: App): boolean;
  /** For toggle commands: shows a check mark in menus. */
  checked?(app: App): boolean;
  run(app: App): void | Promise<void>;
}

/** Perform a recordable step through the shared executor (so Actions record exactly what ran). */
export const doStep = (a: App, type: string, params: Record<string, unknown> = {}) => { void actions.perform(a.ed, type, params).catch((e: Error) => useUi.getState().notify(e.message, 'error')); };
const notify = (t: string, k: 'info' | 'error' | 'warn' = 'info') => useUi.getState().notify(t, k);
const hasSel = (a: App) => a.ed.selection.length > 0;

export { baseName } from './commands-util';
import { baseName } from './commands-util';

export async function saveDocument(app: App, asNew = false): Promise<boolean> {
  const ed = app.ed;
  try {
    const res = await platform.saveFile({
      suggestedName: ed.fileName ? baseName(ed.fileName) : ed.doc.name,
      path: asNew ? undefined : ed.filePath ?? undefined,
      data: serializeDocument(ed.doc),
      mime: 'application/json',
      ext: 'vstudio',
      forceDialog: asNew,
    });
    if (!res) return false;
    ed.fileName = res.name;
    ed.filePath = res.path ?? null;
    ed.history.markSaved();
    ed.emit();
    notify(`Saved ${res.name}`);
    return true;
  } catch (e) {
    notify(`Could not save: ${(e as Error).message}`, 'error');
    return false;
  }
}

export async function openDocument(app: App): Promise<void> {
  const f = await platform.openTextFile(['.vstudio', '.json']);
  if (!f) return;
  try {
    const doc = parseDocument(f.text);
    openInNewTab(app, doc, f.name, f.path);
  } catch (e) {
    notify(e instanceof DocumentFormatError ? `Cannot open ${f.name}: ${e.message}` : `Cannot open ${f.name}: ${(e as Error).message}`, 'error');
  }
}

export function openInNewTab(app: App, doc: VDocument, fileName: string | null, path?: string): Editor {
  // Reuse an untouched empty tab like most editors do.
  const cur = app.ws.current;
  const reuse = !cur.history.dirty && !cur.history.canUndo && cur.fileName === null && cur.doc.layers.every((l) => l.children.length === 0);
  if (reuse) {
    cur.loadDocument(doc, fileName);
    cur.filePath = path ?? null;
    return cur;
  }
  const ed = new Editor(doc);
  ed.fileName = fileName;
  ed.filePath = path ?? null;
  app.ws.add(ed);
  return ed;
}

export async function importSvgFile(app: App, place: boolean): Promise<void> {
  const f = await platform.openTextFile(['.svg', 'image/svg+xml']);
  if (!f) return;
  try {
    const { doc, warnings } = importSvg(f.text, baseName(f.name));
    useUi.getState().setWarnings(warnings.map((w) => `${f.name}: ${w}`));
    if (place) {
      const ed = app.ed;
      const els = doc.layers.flatMap((l) => l.children);
      let ids: string[] = [];
      ed.apply('Place SVG', (d) => { ids = insertCopies(d, els, ed.activeLayerId); });
      ed.select(ids);
      notify(`Placed ${f.name}${warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}`, warnings.length ? 'warn' : 'info');
    } else {
      openInNewTab(app, doc, null);
      app.ed.doc.name = doc.name;
      notify(`Imported ${f.name}${warnings.length ? ` with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''}`, warnings.length ? 'warn' : 'info');
    }
  } catch (e) {
    notify(`Cannot import ${f.name}: ${(e as Error).message}`, 'error');
  }
}

export async function exportSvgFile(app: App, artboard: Artboard = app.ed.activeArtboard): Promise<void> {
  const ed = app.ed;
  try {
    const res = await platform.saveFile({
      suggestedName: `${baseName(ed.fileName ?? ed.doc.name)}${ed.doc.artboards.length > 1 ? '-' + artboard.name : ''}`,
      data: exportSvg(ed.doc, artboard), mime: 'image/svg+xml', ext: 'svg', forceDialog: true,
    });
    if (res) notify(`Exported ${res.name}`);
  } catch (e) {
    notify(`SVG export failed: ${(e as Error).message}`, 'error');
  }
}

export interface ExportSpec {
  format: 'png' | 'jpeg' | 'pdf' | 'svg';
  artboardIds: string[];
  scale?: number;
  width?: number;
  transparent: boolean;
  quality: number;
  ppi: number;
  bleed?: number;
}

const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, '_').trim() || 'artboard';

/** Exports the chosen artboards. One file → save dialog; several → batch save. Returns true if anything was saved. */
export async function runExport(app: App, spec: ExportSpec): Promise<boolean> {
  const ed = app.ed;
  const abs = ed.doc.artboards.filter((a) => spec.artboardIds.includes(a.id));
  if (abs.length === 0) { notify('Nothing to export: no artboard selected', 'error'); return false; }
  const base = safeName(baseName(ed.fileName ?? ed.doc.name));
  try {
    const files: { name: string; data: string | Uint8Array; mime: string }[] = [];
    if (spec.format === 'pdf') {
      files.push({ name: `${base}.pdf`, data: exportPdf(ed.doc, abs, { bleed: spec.bleed }), mime: 'application/pdf' });
    } else {
      for (const ab of abs) {
        const name = abs.length > 1 || ed.doc.artboards.length > 1 ? `${base}-${safeName(ab.name)}` : base;
        if (spec.format === 'svg') files.push({ name: `${name}.svg`, data: exportSvg(ed.doc, ab), mime: 'image/svg+xml' });
        else {
          const out = await exportImage(ed.doc, ab, { format: spec.format, scale: spec.scale, width: spec.width, transparent: spec.transparent, quality: spec.quality, ppi: spec.ppi, bleed: spec.bleed });
          files.push({ name: `${name}.${spec.format === 'jpeg' ? 'jpg' : 'png'}`, data: out.bytes, mime: spec.format === 'jpeg' ? 'image/jpeg' : 'image/png' });
        }
      }
    }
    if (files.length === 1) {
      const f = files[0];
      const dot = f.name.lastIndexOf('.');
      const res = await platform.saveFile({ suggestedName: f.name.slice(0, dot), ext: f.name.slice(dot + 1), data: f.data, mime: f.mime, forceDialog: true });
      if (res) notify(`Exported ${res.name}`);
      return !!res;
    }
    const saved = await platform.saveFiles(files);
    if (saved) notify(`Exported ${saved.length} files`);
    return !!saved;
  } catch (e) {
    notify(`Export failed: ${(e as Error).message}`, 'error');
    return false;
  }
}

const tool = (id: ToolId, label: string, key: string): Command => ({
  id: `tool.${id}`, label, shortcut: key, run: (a) => a.ed.setTool(id),
});

export const COMMANDS: Command[] = [
  { id: 'file.new', label: 'New…', shortcut: 'Ctrl+N', run: () => useUi.getState().openDialog('new') },
  { id: 'file.open', label: 'Open…', shortcut: 'Ctrl+O', run: (a) => openDocument(a) },
  { id: 'file.save', label: 'Save', shortcut: 'Ctrl+S', run: async (a) => { await saveDocument(a); } },
  { id: 'file.saveAs', label: 'Save As…', shortcut: 'Ctrl+Shift+S', run: async (a) => { await saveDocument(a, true); } },
  { id: 'file.importSvg', label: 'Open SVG…', run: (a) => importSvgFile(a, false) },
  { id: 'file.placeSvg', label: 'Place SVG…', run: (a) => importSvgFile(a, true) },
  { id: 'file.exportSvg', label: 'Export Artboard as SVG…', run: (a) => exportSvgFile(a) },
  { id: 'file.exportPng', label: 'Export…', shortcut: 'Ctrl+Shift+E', run: () => useUi.getState().openDialog('export') },
  { id: 'file.trace', label: 'Trace Image…', run: (a) => traceImageFile(a) },
  { id: 'file.batch', label: 'Batch Resize & Export…', run: () => useUi.getState().openDialog('batch') },
  { id: 'file.openTemplate', label: 'New from Template File…', run: (a) => openTemplateFile(a) },
  { id: 'file.close', label: 'Close Tab', shortcut: 'Ctrl+W', run: (a) => closeTab(a, a.ws.active) },

  { id: 'edit.undo', label: 'Undo', shortcut: 'Ctrl+Z', enabled: (a) => a.ed.history.canUndo, run: (a) => a.ed.undo() },
  { id: 'edit.redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', enabled: (a) => a.ed.history.canRedo, run: (a) => a.ed.redo() },
  { id: 'edit.redo2', label: 'Redo', shortcut: 'Ctrl+Y', enabled: (a) => a.ed.history.canRedo, run: (a) => a.ed.redo() },
  { id: 'edit.cut', label: 'Cut', shortcut: 'Ctrl+X', enabled: hasSel, run: (a) => a.ed.cut() },
  { id: 'edit.copy', label: 'Copy', shortcut: 'Ctrl+C', enabled: hasSel, run: (a) => a.ed.copy() },
  { id: 'edit.paste', label: 'Paste', shortcut: 'Ctrl+V', enabled: (a) => a.ed.clipboard.length > 0, run: (a) => a.ed.paste(false) },
  { id: 'edit.pasteInPlace', label: 'Paste in Place', shortcut: 'Ctrl+Shift+V', enabled: (a) => a.ed.clipboard.length > 0, run: (a) => a.ed.paste(true) },
  { id: 'edit.pasteFront', label: 'Paste in Front', shortcut: 'Ctrl+F', enabled: (a) => a.ed.clipboard.length > 0, run: (a) => a.ed.pasteRelative('front') },
  { id: 'edit.pasteBack', label: 'Paste in Back', shortcut: 'Ctrl+B', enabled: (a) => a.ed.clipboard.length > 0, run: (a) => a.ed.pasteRelative('back') },
  { id: 'edit.pasteArtboard', label: 'Paste on Active Artboard', enabled: (a) => a.ed.clipboard.length > 0, run: (a) => a.ed.pasteOnActiveArtboard() },
  { id: 'edit.duplicate', label: 'Duplicate', shortcut: 'Ctrl+D', enabled: hasSel, run: (a) => a.ed.duplicateSelection(10, 10) },
  { id: 'edit.delete', label: 'Delete', shortcut: 'Delete', enabled: hasSel, run: (a) => a.ed.deleteSelection() },
  { id: 'edit.selectAll', label: 'Select All', shortcut: 'Ctrl+A', run: (a) => doStep(a, 'selectAll') },
  { id: 'edit.deselect', label: 'Deselect', shortcut: 'Ctrl+Shift+A', enabled: hasSel, run: (a) => doStep(a, 'deselect') },

  { id: 'object.group', label: 'Group', shortcut: 'Ctrl+G', enabled: (a) => a.ed.selection.length > 1, run: (a) => doStep(a, 'group') },
  { id: 'object.ungroup', label: 'Ungroup', shortcut: 'Ctrl+Shift+G', enabled: (a) => a.ed.selectedElements.some((e) => e.type === 'group'), run: (a) => doStep(a, 'ungroup') },
  { id: 'object.front', label: 'Bring to Front', shortcut: 'Ctrl+Shift+]', enabled: hasSel, run: (a) => a.ed.arrange('front') },
  { id: 'object.forward', label: 'Bring Forward', shortcut: 'Ctrl+]', enabled: hasSel, run: (a) => a.ed.arrange('forward') },
  { id: 'object.backward', label: 'Send Backward', shortcut: 'Ctrl+[', enabled: hasSel, run: (a) => a.ed.arrange('backward') },
  { id: 'object.back', label: 'Send to Back', shortcut: 'Ctrl+Shift+[', enabled: hasSel, run: (a) => a.ed.arrange('back') },
  { id: 'object.unite', label: 'Unite', enabled: (a) => a.ed.selection.length > 1, run: (a) => doStep(a, 'boolean', { op: 'unite' }) },
  { id: 'object.subtract', label: 'Minus Front', enabled: (a) => a.ed.selection.length > 1, run: (a) => doStep(a, 'boolean', { op: 'subtract' }) },
  { id: 'object.intersect', label: 'Intersect', enabled: (a) => a.ed.selection.length > 1, run: (a) => doStep(a, 'boolean', { op: 'intersect' }) },
  { id: 'object.exclude', label: 'Exclude Overlap', enabled: (a) => a.ed.selection.length > 1, run: (a) => doStep(a, 'boolean', { op: 'exclude' }) },
  { id: 'object.makeCompound', label: 'Make Compound Path', shortcut: 'Ctrl+8', enabled: (a) => a.ed.selection.length > 1, run: (a) => doStep(a, 'makeCompound') },
  { id: 'object.releaseCompound', label: 'Release Compound Path', shortcut: 'Ctrl+Alt+8', enabled: (a) => a.ed.selectedElements.some((e) => e.type === 'path' && e.extra.length > 0), run: (a) => doStep(a, 'releaseCompound') },
  { id: 'object.makeClip', label: 'Make Clipping Mask', shortcut: 'Ctrl+7', enabled: (a) => a.ed.selection.length > 1, run: (a) => doStep(a, 'makeClip') },
  { id: 'object.releaseClip', label: 'Release Clipping Mask', shortcut: 'Ctrl+Alt+7', enabled: (a) => a.ed.selectedElements.some((e) => e.type === 'group' && !!e.clip), run: (a) => doStep(a, 'releaseClip') },
  { id: 'object.outlines', label: 'Create Outlines', shortcut: 'Ctrl+Shift+O', enabled: (a) => a.ed.selectedTexts.length > 0, run: (a) => doStep(a, 'createOutlines') },
  { id: 'object.textOnPath', label: 'Make Text on Path', enabled: (a) => a.ed.selectedTexts.length === 1 && a.ed.selectedElements.some((e) => e.type === 'path'), run: (a) => { a.ed.makeTextOnPath(); } },
  { id: 'object.releaseTextPath', label: 'Release Text from Path', enabled: (a) => a.ed.selectedTexts.some((t) => !!t.path), run: (a) => a.ed.releaseTextFromPath() },
  { id: 'object.toPath', label: 'Convert to Path', enabled: (a) => a.ed.selection.some((id) => { const t = getElement(a.ed.doc, id)?.type; return t === 'rect' || t === 'ellipse'; }), run: (a) => a.ed.convertSelectionToPaths() },
  { id: 'object.expandStroke', label: 'Expand Stroke', enabled: (a) => a.ed.selectedElements.some((e) => e.type !== 'group' && !!e.stroke && e.stroke.width > 0), run: (a) => doStep(a, 'expandStroke') },
  { id: 'object.offsetPath', label: 'Offset Path…', enabled: hasSel, run: () => useUi.getState().openDialog('offset') },
  { id: 'select.sameFill', label: 'Same Fill', enabled: hasSel, run: (a) => { const id = a.ed.selection[0]; if (id) a.ed.selectSimilar(id, 'fill'); } },
  { id: 'select.sameStroke', label: 'Same Stroke', enabled: hasSel, run: (a) => { const id = a.ed.selection[0]; if (id) a.ed.selectSimilar(id, 'stroke'); } },
  { id: 'select.allText', label: 'All Text Objects', run: (a) => doStep(a, 'selectByType', { types: ['text'] }) },
  { id: 'select.allPaths', label: 'All Paths', run: (a) => doStep(a, 'selectByType', { types: ['path'] }) },
  { id: 'effect.dropShadow', label: 'Drop Shadow', enabled: hasSel, run: (a) => doStep(a, 'addEffect', { effect: { type: 'dropShadow', dx: 6, dy: 6, blur: 8, color: '#000000', alpha: 0.5 } }) },
  { id: 'effect.outerGlow', label: 'Outer Glow', enabled: hasSel, run: (a) => doStep(a, 'addEffect', { effect: { type: 'outerGlow', blur: 12, color: '#ffd400', alpha: 0.8 } }) },
  { id: 'effect.blur', label: 'Gaussian Blur', enabled: hasSel, run: (a) => doStep(a, 'addEffect', { effect: { type: 'blur', radius: 4 } }) },
  { id: 'effect.clear', label: 'Remove Live Effects', enabled: (a) => a.ed.selectedElements.some((e) => !!e.effects?.length), run: (a) => doStep(a, 'clearEffects') },
  { id: 'type.panel', label: 'Show Typography Panel', run: () => layout.show('typography', true) },
  { id: 'object.cleanup', label: 'Clean Up Vectors…', run: () => useUi.getState().openDialog('cleanup') },
  { id: 'object.colors', label: 'Reduce / Replace Colors…', run: () => useUi.getState().openDialog('colors') },
  { id: 'object.swap', label: 'Swap Fill and Stroke', shortcut: 'Shift+X', run: (a) => a.ed.swapFillStroke() },

  { id: 'view.zoomIn', label: 'Zoom In', shortcut: 'Ctrl+=', run: (a) => a.ed.zoomBy(1.25) },
  { id: 'view.zoomIn2', label: 'Zoom In', shortcut: 'Ctrl++', run: (a) => a.ed.zoomBy(1.25) },
  { id: 'view.zoomOut', label: 'Zoom Out', shortcut: 'Ctrl+-', run: (a) => a.ed.zoomBy(0.8) },
  { id: 'view.fit', label: 'Fit Artboard in Window', shortcut: 'Ctrl+0', run: (a) => a.ed.fitArtboard() },
  { id: 'view.fitAll', label: 'Fit All in Window', shortcut: 'Ctrl+Alt+0', run: (a) => a.ed.fitAll() },
  { id: 'view.rulers', label: 'Rulers', shortcut: 'Ctrl+R', checked: (a) => a.ed.showRulers, run: (a) => a.ed.toggleRulers() },
  { id: 'view.snap', label: 'Snap to Guides and Objects', shortcut: 'Ctrl+;', checked: (a) => a.ed.snapEnabled, run: (a) => a.ed.toggleSnap() },
  { id: 'view.clearGuides', label: 'Clear Guides', enabled: (a) => (a.ed.doc.guides ?? []).length > 0, run: (a) => a.ed.clearGuides() },
  { id: 'view.actual', label: 'Actual Size', shortcut: 'Ctrl+1', run: (a) => a.ed.zoomTo(1) },

  tool('select', 'Selection Tool', 'V'),
  tool('direct', 'Direct Selection Tool', 'A'),
  tool('rect', 'Rectangle Tool', 'M'),
  tool('ellipse', 'Ellipse Tool', 'L'),
  tool('pen', 'Pen Tool', 'P'),
  tool('text', 'Type Tool', 'T'),
  tool('wand', 'Magic Wand Tool', 'Y'),
  tool('lasso', 'Lasso Tool', 'Q'),
  tool('pencil', 'Pencil Tool', 'N'),
  tool('eyedropper', 'Eyedropper Tool', 'I'),
  tool('gradient', 'Gradient Tool', 'G'),
  tool('artboard', 'Artboard Tool', 'Shift+O'),
  tool('line', 'Line Segment Tool', '\\'),
  tool('rrect', 'Rounded Rectangle Tool', ''),
  tool('polygon', 'Polygon Tool', ''),
  tool('star', 'Star Tool', ''),
  tool('arc', 'Arc Tool', ''),
  tool('spiral', 'Spiral Tool', ''),
  tool('hand', 'Hand Tool', 'H'),
  tool('zoom', 'Zoom Tool', 'Z'),

  { id: 'help.shortcuts', label: 'Keyboard Shortcuts', shortcut: 'F1', run: () => useUi.getState().openDialog('shortcuts') },
  { id: 'help.about', label: 'About Vector Studio', run: () => useUi.getState().openDialog('about') },
];

export const cmd = (id: string): Command => {
  const c = COMMANDS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown command ${id}`);
  return c;
};

export function closeTab(app: App, index: number): void {
  const ed = app.ws.editors[index];
  if (!ed) return;
  if (ed.history.dirty && !window.confirm(`"${ed.fileName ?? ed.doc.name}" has unsaved changes. Close without saving?`)) return;
  app.ws.close(index);
}

export function newDocumentFrom(app: App, name: string, w: number, h: number, background: string | null, extra: { ppi?: number; guides?: { axis: 'v' | 'h'; pos: number }[] } = {}): void {
  const doc = createDocument(name, w, h);
  doc.artboards[0].background = background;
  if (extra.ppi) doc.ppi = extra.ppi;
  if (extra.guides?.length) doc.guides = extra.guides.map((g) => ({ id: newId(), ...g }));
  const ed = new Editor(doc);
  app.ws.add(ed);
  ed.fitArtboard();
}

// ---- shortcut matching (driven by the customisable keymap) ----
export const keymap = new Keymap(COMMANDS);

export interface ParsedShortcut { key: string; ctrl: boolean; shift: boolean; alt: boolean }
export function parseShortcut(s: string): ParsedShortcut {
  const n = normalizeShortcut(s);
  const parts = n.endsWith('++') ? [...n.slice(0, -2).split('+'), '+'] : n.split('+');
  const key = parts[parts.length - 1];
  return { key: key.toLowerCase(), ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
}

/** The command bound to this key event under the active keymap, or null. */
export function commandForKey(e: KeyEventLike): Command | null {
  const s = eventToShortcut(e);
  if (!s) return null;
  const id = keymap.commandFor(s);
  return id ? COMMANDS.find((c) => c.id === id) ?? null : null;
}

/** Shortcut shown in menus for a command (honours user changes). */
export const shortcutOf = (c: Command): string => keymap.get(c.id) ?? '';

export const SHORTCUT_LIST = COMMANDS.filter((c) => !/2$/.test(c.id) && !c.id.endsWith('zoomIn2'));

/** Decode a raster file into RGBA (flattened on white, scaled down so the longest side is at most `maxSide`). */
export async function decodeImage(bytes: Uint8Array, maxSide = 1600): Promise<{ image: { width: number; height: number; data: Uint8ClampedArray }; scaledFrom?: [number, number] }> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  return { image: { width: w, height: h, data: data.data }, scaledFrom: s < 1 ? [bmp.width, bmp.height] : undefined };
}

export async function traceImageFile(_app: App): Promise<void> {
  const f = await platform.openBinaryFile(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);
  if (!f) return;
  try {
    const d = await decodeImage(f.bytes);
    useUi.getState().setTraceImage({ name: f.name, image: d.image, scaledFrom: d.scaledFrom });
    useUi.getState().openDialog('trace');
  } catch (e) {
    notify(`Cannot read ${f.name} as an image: ${(e as Error).message}`, 'error');
  }
}

/** Opens a .vstudio file as a NEW untitled document, so saving never overwrites the template. */
export async function openTemplateFile(app: App): Promise<void> {
  const f = await platform.openTextFile(['.vstudio', '.json']);
  if (!f) return;
  try {
    const doc = parseDocument(f.text);
    doc.name = `${baseName(f.name)} copy`;
    const ed = new Editor(doc);
    app.ws.add(ed);
    ed.fitArtboard();
  } catch (e) {
    notify(`Cannot open ${f.name}: ${(e as Error).message}`, 'error');
  }
}

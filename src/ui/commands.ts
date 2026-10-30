import { createDocument, getElement, insertCopies, parseDocument, serializeDocument, DocumentFormatError, type Artboard, type VDocument } from '../core/document';
import { exportSvg, importSvg } from '../core/io';
import { Editor } from '../editor/editor';
import type { ToolId } from '../editor/types';
import { exportPng } from '../render/browser-export';
import { platform } from '../platform';
import { useUi } from './store';
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
  run(app: App): void | Promise<void>;
}

const notify = (t: string, k: 'info' | 'error' | 'warn' = 'info') => useUi.getState().notify(t, k);
const hasSel = (a: App) => a.ed.selection.length > 0;

export const baseName = (n: string) => n.replace(/\.[^.]+$/, '');

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

export async function exportPngFile(app: App, artboard: Artboard, opts: { scale?: number; width?: number; height?: number; transparent?: boolean }): Promise<boolean> {
  const ed = app.ed;
  try {
    const out = await exportPng(ed.doc, artboard, opts);
    const res = await platform.saveFile({
      suggestedName: `${baseName(ed.fileName ?? ed.doc.name)}${ed.doc.artboards.length > 1 ? '-' + artboard.name : ''}`,
      data: out.bytes, mime: 'image/png', ext: 'png', forceDialog: true,
    });
    if (res) notify(`Exported ${res.name} (${out.width}×${out.height}px)`);
    return !!res;
  } catch (e) {
    notify(`PNG export failed: ${(e as Error).message}`, 'error');
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
  { id: 'file.exportPng', label: 'Export Artboard as PNG…', shortcut: 'Ctrl+Shift+E', run: () => useUi.getState().openDialog('export') },
  { id: 'file.close', label: 'Close Tab', shortcut: 'Ctrl+W', run: (a) => closeTab(a, a.ws.active) },

  { id: 'edit.undo', label: 'Undo', shortcut: 'Ctrl+Z', enabled: (a) => a.ed.history.canUndo, run: (a) => a.ed.undo() },
  { id: 'edit.redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', enabled: (a) => a.ed.history.canRedo, run: (a) => a.ed.redo() },
  { id: 'edit.redo2', label: 'Redo', shortcut: 'Ctrl+Y', enabled: (a) => a.ed.history.canRedo, run: (a) => a.ed.redo() },
  { id: 'edit.cut', label: 'Cut', shortcut: 'Ctrl+X', enabled: hasSel, run: (a) => a.ed.cut() },
  { id: 'edit.copy', label: 'Copy', shortcut: 'Ctrl+C', enabled: hasSel, run: (a) => a.ed.copy() },
  { id: 'edit.paste', label: 'Paste', shortcut: 'Ctrl+V', enabled: (a) => a.ed.clipboard.length > 0, run: (a) => a.ed.paste(false) },
  { id: 'edit.pasteInPlace', label: 'Paste in Place', shortcut: 'Ctrl+Shift+V', enabled: (a) => a.ed.clipboard.length > 0, run: (a) => a.ed.paste(true) },
  { id: 'edit.duplicate', label: 'Duplicate', shortcut: 'Ctrl+D', enabled: hasSel, run: (a) => a.ed.duplicateSelection(10, 10) },
  { id: 'edit.delete', label: 'Delete', shortcut: 'Delete', enabled: hasSel, run: (a) => a.ed.deleteSelection() },
  { id: 'edit.selectAll', label: 'Select All', shortcut: 'Ctrl+A', run: (a) => a.ed.selectAll() },
  { id: 'edit.deselect', label: 'Deselect', shortcut: 'Ctrl+Shift+A', enabled: hasSel, run: (a) => a.ed.clearSelection() },

  { id: 'object.group', label: 'Group', shortcut: 'Ctrl+G', enabled: (a) => a.ed.selection.length > 1, run: (a) => a.ed.group() },
  { id: 'object.ungroup', label: 'Ungroup', shortcut: 'Ctrl+Shift+G', enabled: (a) => a.ed.selectedElements.some((e) => e.type === 'group'), run: (a) => a.ed.ungroup() },
  { id: 'object.front', label: 'Bring to Front', shortcut: 'Ctrl+Shift+]', enabled: hasSel, run: (a) => a.ed.arrange('front') },
  { id: 'object.forward', label: 'Bring Forward', shortcut: 'Ctrl+]', enabled: hasSel, run: (a) => a.ed.arrange('forward') },
  { id: 'object.backward', label: 'Send Backward', shortcut: 'Ctrl+[', enabled: hasSel, run: (a) => a.ed.arrange('backward') },
  { id: 'object.back', label: 'Send to Back', shortcut: 'Ctrl+Shift+[', enabled: hasSel, run: (a) => a.ed.arrange('back') },
  { id: 'object.unite', label: 'Unite', enabled: (a) => a.ed.selection.length > 1, run: (a) => { a.ed.boolean('unite'); } },
  { id: 'object.subtract', label: 'Minus Front', enabled: (a) => a.ed.selection.length > 1, run: (a) => { a.ed.boolean('subtract'); } },
  { id: 'object.intersect', label: 'Intersect', enabled: (a) => a.ed.selection.length > 1, run: (a) => { a.ed.boolean('intersect'); } },
  { id: 'object.exclude', label: 'Exclude Overlap', enabled: (a) => a.ed.selection.length > 1, run: (a) => { a.ed.boolean('exclude'); } },
  { id: 'object.makeCompound', label: 'Make Compound Path', shortcut: 'Ctrl+8', enabled: (a) => a.ed.selection.length > 1, run: (a) => a.ed.makeCompound() },
  { id: 'object.releaseCompound', label: 'Release Compound Path', shortcut: 'Ctrl+Alt+8', enabled: (a) => a.ed.selectedElements.some((e) => e.type === 'path' && e.extra.length > 0), run: (a) => a.ed.releaseCompound() },
  { id: 'object.toPath', label: 'Convert to Path', enabled: (a) => a.ed.selection.some((id) => { const t = getElement(a.ed.doc, id)?.type; return t === 'rect' || t === 'ellipse'; }), run: (a) => a.ed.convertSelectionToPaths() },
  { id: 'object.swap', label: 'Swap Fill and Stroke', shortcut: 'Shift+X', run: (a) => a.ed.swapFillStroke() },

  { id: 'view.zoomIn', label: 'Zoom In', shortcut: 'Ctrl+=', run: (a) => a.ed.zoomBy(1.25) },
  { id: 'view.zoomIn2', label: 'Zoom In', shortcut: 'Ctrl++', run: (a) => a.ed.zoomBy(1.25) },
  { id: 'view.zoomOut', label: 'Zoom Out', shortcut: 'Ctrl+-', run: (a) => a.ed.zoomBy(0.8) },
  { id: 'view.fit', label: 'Fit Artboard in Window', shortcut: 'Ctrl+0', run: (a) => a.ed.fitArtboard() },
  { id: 'view.fitAll', label: 'Fit All in Window', shortcut: 'Ctrl+Alt+0', run: (a) => a.ed.fitAll() },
  { id: 'view.actual', label: 'Actual Size', shortcut: 'Ctrl+1', run: (a) => a.ed.zoomTo(1) },

  tool('select', 'Selection Tool', 'V'),
  tool('direct', 'Direct Selection Tool', 'A'),
  tool('rect', 'Rectangle Tool', 'M'),
  tool('ellipse', 'Ellipse Tool', 'L'),
  tool('pen', 'Pen Tool', 'P'),
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

export function newDocumentFrom(app: App, name: string, w: number, h: number, background: string | null): void {
  const doc = createDocument(name, w, h);
  doc.artboards[0].background = background;
  const ed = new Editor(doc);
  app.ws.add(ed);
  ed.fitArtboard();
}

// ---- shortcut matching ----
export interface ParsedShortcut { key: string; ctrl: boolean; shift: boolean; alt: boolean }

export function parseShortcut(s: string): ParsedShortcut {
  const parts = s.split('+');
  // A trailing "+" key ("Ctrl++") yields an empty last part.
  const key = s.endsWith('++') ? '+' : parts[parts.length - 1];
  const mods = s.endsWith('++') ? parts.slice(0, -2) : parts.slice(0, -1);
  return { key: key.toLowerCase(), ctrl: mods.includes('Ctrl'), shift: mods.includes('Shift'), alt: mods.includes('Alt') };
}

const PARSED = COMMANDS.filter((c) => c.shortcut).map((c) => ({ c, s: parseShortcut(c.shortcut!) }));

/** Finds the command for a key event. Tool letters only fire when no modifier is held. */
export function commandForKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; code?: string }): Command | null {
  const ctrl = e.ctrlKey || e.metaKey;
  let key = e.key.toLowerCase();
  // Shift changes the produced character for punctuation; map back so "Ctrl+Shift+]" works.
  const shiftMap: Record<string, string> = { '}': ']', '{': '[', '_': '-', '+': '+', ')': '0' };
  if (e.shiftKey && shiftMap[key]) key = shiftMap[key];
  for (const { c, s } of PARSED) {
    if (s.key !== key || s.ctrl !== ctrl || s.alt !== e.altKey) continue;
    if (s.shift !== e.shiftKey && !(key === '+' && ctrl)) continue;
    return c;
  }
  return null;
}

export const SHORTCUT_LIST = COMMANDS.filter((c) => c.shortcut && !/2$/.test(c.id));

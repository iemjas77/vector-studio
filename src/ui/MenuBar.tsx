import { useEffect, useRef, useState } from 'react';
import { cmd, shortcutOf, type App } from './commands';
import { listPlugins, type PluginApi } from '../automation/plugin';
import { useUi } from './store';
import { layout } from './layout-service';
import { ALL_PANELS } from './workspace-layout';
import { PANEL_TITLES } from './panel-titles';
import { useApp } from './hooks';

type Entry = string | '-';
const MENUS: { label: string; items: Entry[] }[] = [
  { label: 'File', items: ['file.new', 'file.open', 'file.openTemplate', '-', 'file.save', 'file.saveAs', '-', 'file.importSvg', 'file.placeSvg', 'file.trace', '-', 'file.exportSvg', 'file.exportPng', 'file.batch', '-', 'file.close'] },
  { label: 'Edit', items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.pasteInPlace', 'edit.pasteFront', 'edit.pasteBack', 'edit.pasteArtboard', '-', 'edit.duplicate', 'edit.delete', '-', 'edit.selectAll', 'edit.deselect'] },
  { label: 'Object', items: ['object.group', 'object.ungroup', '-', 'object.front', 'object.forward', 'object.backward', 'object.back', '-', 'object.unite', 'object.subtract', 'object.intersect', 'object.exclude', '-', 'object.makeCompound', 'object.releaseCompound', '-', 'object.makeClip', 'object.releaseClip', '-', 'object.toPath', 'object.expandStroke', 'object.offsetPath', 'object.cleanup', 'object.colors', 'object.swap'] },
  { label: 'Type', items: ['type.panel', '-', 'object.outlines', 'object.textOnPath', 'object.releaseTextPath'] },
  { label: 'Select', items: ['edit.selectAll', 'edit.deselect', '-', 'select.sameFill', 'select.sameStroke', '-', 'select.allText', 'select.allPaths'] },
  { label: 'Effect', items: ['effect.dropShadow', 'effect.outerGlow', 'effect.blur', '-', 'effect.clear'] },
  { label: 'View', items: ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.fitAll', 'view.actual', '-', 'view.rulers', 'view.snap', 'view.clearGuides'] },
  { label: 'Window', items: ['@window'] },
  { label: 'Help', items: ['help.shortcuts', 'help.about'] },
];

export function MenuBar() {
  const app = useApp();
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={ref} className="flex items-center bg-panel border-b border-edge h-7 px-1" role="menubar" data-testid="menubar">
      <span className="px-2 font-semibold text-accent">Vector Studio</span>
      {[...MENUS.slice(0, -1), ...(listPlugins().length ? [{ label: 'Plugins', items: ['@plugins'] }] : []), MENUS[MENUS.length - 1]].map((m, i) => (
        <div key={m.label} className="relative">
          <button
            className="px-3 h-7 hover:bg-panel2 cursor-pointer" style={{ background: open === i ? '#3a3a3a' : undefined, border: 0 }}
            onClick={() => setOpen(open === i ? null : i)} onMouseEnter={() => open !== null && setOpen(i)}
            aria-haspopup="menu" aria-expanded={open === i}
          >{m.label}</button>
          {open === i && (
            <div className="menu-pop" role="menu">
              {m.items.map((it, k) => it === '-' ? <div key={k} className="menu-sep" />
                : it === '@window' ? <WindowMenu onDone={() => setOpen(null)} />
                : it === '@plugins' ? listPlugins().flatMap((p) => p.commands.map((c) => (
                  <button key={`${p.id}:${c.id}`} className="menu-item" role="menuitem" data-testid={`menu-plugin-${p.id}-${c.id}`} onClick={() => { setOpen(null); void c.run(pluginApi(app)); }}>
                    <span>{c.label}</span><span className="text-mute">{p.name}</span></button>)))
                : <MenuItem key={it} id={it} app={app} onDone={() => setOpen(null)} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MenuItem({ id, app, onDone }: { id: string; app: App; onDone(): void }) {
  const c = cmd(id);
  const enabled = c.enabled ? c.enabled(app) : true;
  return (
    <button className="menu-item" role="menuitem" data-testid={`menu-${id}`} disabled={!enabled} onClick={() => { onDone(); void c.run(app); }}>
      <span>{c.checked ? (c.checked(app) ? '✓ ' : '\u2003') : ''}{c.label}</span><span className="text-mute">{shortcutOf(c)}</span>
    </button>
  );
}

function pluginApi(app: App): PluginApi {
  const ed = app.ed;
  return {
    get doc() { return ed.doc; },
    get selection() { return ed.selection; },
    apply: (label, recipe) => { ed.apply(label, recipe); },
    select: (ids) => ed.select(ids),
    notify: (m) => useUi.getState().notify(m),
  };
}

function WindowMenu({ onDone }: { onDone(): void }) {
  const notify = (m: string) => useUi.getState().notify(m, 'error');
  const guard = (fn: () => void) => { try { fn(); } catch (e) { notify((e as Error).message); } };
  return (
    <>
      <div className="px-3 text-mute">Workspace</div>
      {layout.presetNames.map((n) => (
        <button key={n} className="menu-item" role="menuitemradio" aria-checked={layout.active === n} data-testid={`ws-${n}`} onClick={() => { guard(() => layout.switchTo(n)); onDone(); }}>
          <span>{layout.active === n ? '● ' : '\u2003'}{n}{layout.active === n && layout.modified ? ' (modified)' : ''}</span>
        </button>
      ))}
      <div className="menu-sep" />
      <button className="menu-item" data-testid="ws-save" onClick={() => { const n = window.prompt('Name for this workspace'); onDone(); if (n) guard(() => layout.saveAs(n)); }}><span>Save Workspace…</span></button>
      <button className="menu-item" data-testid="ws-reset" onClick={() => { guard(() => layout.reset()); onDone(); }}><span>Reset “{layout.active}”</span></button>
      <button className="menu-item" data-testid="ws-duplicate" onClick={() => { guard(() => layout.switchTo(layout.duplicate(layout.active))); onDone(); }}><span>Duplicate “{layout.active}”</span></button>
      <button className="menu-item" data-testid="ws-rename" disabled={layout.isBuiltin(layout.active)} onClick={() => { const n = window.prompt('New name', layout.active); onDone(); if (n) guard(() => layout.rename(layout.active, n)); }}><span>Rename…</span></button>
      <button className="menu-item" data-testid="ws-delete" disabled={layout.isBuiltin(layout.active)} onClick={() => { if (window.confirm(`Delete workspace "${layout.active}"?`)) guard(() => layout.delete(layout.active)); onDone(); }}><span>Delete</span></button>
      <div className="menu-sep" />
      <div className="px-3 text-mute">Panels</div>
      {ALL_PANELS.map((id) => (
        <button key={id} className="menu-item" role="menuitemcheckbox" aria-checked={layout.isVisible(id)} data-testid={`win-${id}`} onClick={() => layout.show(id, !layout.isVisible(id))}>
          <span>{layout.isVisible(id) ? '✓ ' : '\u2003'}{PANEL_TITLES[id] ?? id}</span>
        </button>
      ))}
    </>
  );
}

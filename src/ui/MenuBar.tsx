import { useEffect, useRef, useState } from 'react';
import { cmd, type App } from './commands';
import { listPlugins, type PluginApi } from '../automation/plugin';
import { useUi } from './store';
import { useApp } from './hooks';

type Entry = string | '-';
const MENUS: { label: string; items: Entry[] }[] = [
  { label: 'File', items: ['file.new', 'file.open', '-', 'file.save', 'file.saveAs', '-', 'file.openTemplate', '-', 'file.importSvg', 'file.placeSvg', 'file.trace', '-', 'file.exportSvg', 'file.exportPng', 'file.batch', '-', 'file.close'] },
  { label: 'Edit', items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.pasteInPlace', '-', 'edit.duplicate', 'edit.delete', '-', 'edit.selectAll', 'edit.deselect'] },
  { label: 'Object', items: ['object.group', 'object.ungroup', '-', 'object.front', 'object.forward', 'object.backward', 'object.back', '-', 'object.unite', 'object.subtract', 'object.intersect', 'object.exclude', '-', 'object.makeCompound', 'object.releaseCompound', '-', 'object.makeClip', 'object.releaseClip', '-', 'object.outlines', 'object.textOnPath', 'object.releaseTextPath', '-', 'object.toPath', 'object.expandStroke', 'object.offsetPath', 'object.cleanup', 'object.colors', 'object.swap'] },
  { label: 'View', items: ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.fitAll', 'view.actual', '-', 'view.rulers', 'view.snap', 'view.clearGuides'] },
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
      <span>{c.checked ? (c.checked(app) ? '✓ ' : '\u2003') : ''}{c.label}</span><span className="text-mute">{c.shortcut ?? ''}</span>
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

import { useState, type ReactNode } from 'react';
import { rasterSize } from '../../render/export';
import { ARTBOARD_PRESETS } from '../panels/Artboards';
import { exportPngFile, newDocumentFrom, SHORTCUT_LIST } from '../commands';
import { useApp } from '../hooks';
import { useUi } from '../store';

function Dialog({ title, children, onClose, testId }: { title: string; children: ReactNode; onClose(): void; testId: string }) {
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-label={title} data-testid={testId} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function numberInput(v: string, set: (s: string) => void, testId: string, w = 80) {
  return <input type="text" inputMode="numeric" data-testid={testId} style={{ width: w }} value={v} onChange={(e) => set(e.target.value)} />;
}

export function NewDocumentDialog() {
  const app = useApp();
  const close = () => useUi.getState().openDialog(null);
  const [name, setName] = useState('Untitled');
  const [preset, setPreset] = useState(0);
  const [w, setW] = useState(String(ARTBOARD_PRESETS[0].w));
  const [h, setH] = useState(String(ARTBOARD_PRESETS[0].h));
  const [transparent, setTransparent] = useState(true);
  const wn = Math.round(+w), hn = Math.round(+h);
  const valid = wn >= 1 && hn >= 1 && wn <= 16384 && hn <= 16384;
  return (
    <Dialog title="New Document" onClose={close} testId="dialog-new">
      <div className="flex flex-col gap-3">
        <div className="row"><span style={{ width: 70 }}>Name</span><input type="text" data-testid="new-name" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="row"><span style={{ width: 70 }}>Preset</span>
          <select data-testid="new-preset" style={{ flex: 1 }} value={preset} onChange={(e) => { const i = +e.target.value; setPreset(i); if (i >= 0) { setW(String(ARTBOARD_PRESETS[i].w)); setH(String(ARTBOARD_PRESETS[i].h)); } }}>
            {ARTBOARD_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
            <option value={-1}>Custom</option>
          </select></div>
        <div className="row"><span style={{ width: 70 }}>Size (px)</span>{numberInput(w, (s) => { setW(s); setPreset(-1); }, 'new-w')}<span>×</span>{numberInput(h, (s) => { setH(s); setPreset(-1); }, 'new-h')}</div>
        <label className="row"><input type="checkbox" data-testid="new-transparent" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent artboard (recommended for print-on-demand)</label>
        {!valid && <div style={{ color: '#ff9a9a' }} data-testid="new-error">Size must be between 1 and 16384 pixels.</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" data-testid="new-create" disabled={!valid} onClick={() => { newDocumentFrom(app, name.trim() || 'Untitled', wn, hn, transparent ? null : '#ffffff'); close(); }}>Create</button>
        </div>
      </div>
    </Dialog>
  );
}

export function ExportPngDialog() {
  const app = useApp();
  const ed = app.ed;
  const close = () => useUi.getState().openDialog(null);
  const [abId, setAbId] = useState(ed.activeArtboardId);
  const ab = ed.doc.artboards.find((a) => a.id === abId) ?? ed.doc.artboards[0];
  const [mode, setMode] = useState<'scale' | 'width'>('scale');
  const [scale, setScale] = useState('1');
  const [width, setWidth] = useState(String(Math.round(ab.w)));
  const [transparent, setTransparent] = useState(ab.background === null);
  const [busy, setBusy] = useState(false);
  const opts = mode === 'scale' ? { scale: +scale } : { width: +width };
  const size = (() => { try { return rasterSize(ab, { ...opts, transparent }); } catch { return null; } })();
  const valid = !!size && isFinite(size.w) && size.w >= 1 && size.h >= 1 && size.w <= 16384 && size.h <= 16384;
  return (
    <Dialog title="Export PNG" onClose={close} testId="dialog-export">
      <div className="flex flex-col gap-3">
        <div className="row"><span style={{ width: 70 }}>Artboard</span>
          <select data-testid="export-artboard" style={{ flex: 1 }} value={ab.id} onChange={(e) => { setAbId(e.target.value); const a = ed.doc.artboards.find((x) => x.id === e.target.value)!; setWidth(String(Math.round(a.w))); setTransparent(a.background === null); }}>
            {ed.doc.artboards.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.w}×{a.h})</option>)}
          </select></div>
        <div className="row"><span style={{ width: 70 }}>Size</span>
          <select data-testid="export-mode" value={mode} onChange={(e) => setMode(e.target.value as 'scale' | 'width')}><option value="scale">Scale</option><option value="width">Width (px)</option></select>
          {mode === 'scale' ? <>{numberInput(scale, setScale, 'export-scale', 60)}<span>×</span></> : numberInput(width, setWidth, 'export-width', 80)}</div>
        <label className="row"><input type="checkbox" data-testid="export-transparent" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background</label>
        <div data-testid="export-size" style={{ color: valid ? '#9a9a9a' : '#ff9a9a' }}>{valid ? `Output: ${size!.w} × ${size!.h} px` : 'Output size must be between 1 and 16384 px on each side.'}</div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" data-testid="export-go" disabled={!valid || busy} onClick={async () => { setBusy(true); const ok = await exportPngFile(app, ab, { ...opts, transparent }); setBusy(false); if (ok) close(); }}>Export</button>
        </div>
      </div>
    </Dialog>
  );
}

export function ShortcutsDialog() {
  const close = () => useUi.getState().openDialog(null);
  return (
    <Dialog title="Keyboard Shortcuts" onClose={close} testId="dialog-shortcuts">
      <div style={{ columnCount: 2, columnGap: 24 }}>
        {SHORTCUT_LIST.map((c) => <div key={c.id} className="row" style={{ justifyContent: 'space-between', breakInside: 'avoid' }}><span>{c.label}</span><span className="text-mute">{c.shortcut}</span></div>)}
        <div className="row" style={{ justifyContent: 'space-between' }}><span>Pan (hold)</span><span className="text-mute">Space + drag</span></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span>Nudge / 10px</span><span className="text-mute">Arrows / Shift+Arrows</span></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span>Finish pen path</span><span className="text-mute">Enter / Esc</span></div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" onClick={close}>Close</button></div>
    </Dialog>
  );
}

export function AboutDialog() {
  const close = () => useUi.getState().openDialog(null);
  return (
    <Dialog title="About Vector Studio" onClose={close} testId="dialog-about">
      <p>Vector Studio 0.1 (Phase 1). Offline-first vector editor. See KNOWN-ISSUES.md for current limitations.</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={close}>Close</button></div>
    </Dialog>
  );
}

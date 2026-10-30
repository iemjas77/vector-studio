import { useState, type ReactNode } from 'react';
import { rasterSize, withBleed } from '../../render/export';
import { ARTBOARD_PRESETS } from '../panels/Artboards';
import { TEMPLATES } from '../templates';
import { newDocumentFrom, runExport, SHORTCUT_LIST } from '../commands';
import { EXPORT_PRESETS, type ExportFormat } from '../export-presets';
import { checkExport, physicalSize } from '../../core/io';
import { useApp } from '../hooks';
import { useUi } from '../store';
import { actions } from '../actions-service';

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
  const [templateId, setTemplateId] = useState('');
  const template = TEMPLATES.find((t) => t.id === templateId) ?? null;
  const wn = Math.round(+w), hn = Math.round(+h);
  const valid = wn >= 1 && hn >= 1 && wn <= 16384 && hn <= 16384;
  return (
    <Dialog title="New Document" onClose={close} testId="dialog-new">
      <div className="flex flex-col gap-3">
        <div className="row"><span style={{ width: 70 }}>Name</span><input type="text" data-testid="new-name" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="row"><span style={{ width: 70 }}>Template</span>
          <select data-testid="new-template" style={{ flex: 1 }} value={templateId} onChange={(e) => {
            const t = TEMPLATES.find((x) => x.id === e.target.value);
            setTemplateId(e.target.value);
            if (t) { setW(String(t.width)); setH(String(t.height)); setTransparent(t.transparent); setPreset(-1); }
          }}>
            <option value="">None – use the size below</option>
            {TEMPLATES.filter((t) => t.id !== 'blank').map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select></div>
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
          <button className="btn btn-primary" data-testid="new-create" disabled={!valid} onClick={() => { newDocumentFrom(app, name.trim() || 'Untitled', wn, hn, transparent ? null : '#ffffff', template ? { ppi: template.ppi, guides: template.guides } : {}); close(); }}>Create</button>
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
  const [all, setAll] = useState(false);
  const ab = ed.doc.artboards.find((a) => a.id === abId) ?? ed.doc.artboards[0];
  const [format, setFormat] = useState<ExportFormat>('png');
  const [mode, setMode] = useState<'scale' | 'width'>('scale');
  const [scale, setScale] = useState('1');
  const [width, setWidth] = useState(String(Math.round(ab.w)));
  const [transparent, setTransparent] = useState(ab.background === null);
  const [quality, setQuality] = useState('92');
  const [ppi, setPpi] = useState(String(ed.doc.ppi));
  const [bleed, setBleed] = useState('0');
  const bleedNum = Math.max(0, +bleed || 0);
  const bleedOk = isFinite(+bleed) && +bleed >= 0 && +bleed <= 1000;
  const [busy, setBusy] = useState(false);
  const raster = format === 'png' || format === 'jpeg';
  const opts = mode === 'scale' ? { scale: +scale } : { width: +width };
  const size = (() => { try { return rasterSize(withBleed(ab, bleedNum), { ...opts, transparent }); } catch { return null; } })();
  const sizeOk = !!size && isFinite(size.w) && size.w >= 1 && size.h >= 1 && size.w <= 16384 && size.h <= 16384;
  const ppiNum = +ppi;
  const ppiOk = isFinite(ppiNum) && ppiNum >= 1 && ppiNum <= 2400;
  const qOk = +quality >= 1 && +quality <= 100;
  const valid = bleedOk && (!raster || (sizeOk && ppiOk && (format !== 'jpeg' || qOk)));
  const targets = all ? ed.doc.artboards : [ab];
  const issues = targets.flatMap((a) => checkExport(ed.doc, a, { format, transparent }).map((i) => ({ ...i, text: targets.length > 1 ? `${a.name}: ${i.text}` : i.text })));
  const phys = size && sizeOk && ppiOk ? physicalSize(size.w, size.h, ppiNum) : null;

  const applyPreset = (id: string) => {
    const p = EXPORT_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setFormat(p.format);
    if (p.width) { setMode('width'); setWidth(String(p.width)); } else { setMode('scale'); setScale(String(p.scale ?? 1)); }
    if (p.transparent !== undefined) setTransparent(p.transparent);
    if (p.quality) setQuality(String(Math.round(p.quality * 100)));
    if (p.ppi) setPpi(String(p.ppi));
  };

  return (
    <Dialog title="Export" onClose={close} testId="dialog-export">
      <div className="flex flex-col gap-3" style={{ minWidth: 420 }}>
        <div className="row"><span style={{ width: 70 }}>Preset</span>
          <select data-testid="export-preset" style={{ flex: 1 }} defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="">Custom…</option>
            {EXPORT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select></div>
        <div className="row"><span style={{ width: 70 }}>Format</span>
          <select data-testid="export-format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="png">PNG</option><option value="jpeg">JPEG</option><option value="pdf">PDF (vector)</option><option value="svg">SVG (vector)</option>
          </select>
          {format === 'jpeg' && <><span>Quality</span>{numberInput(quality, setQuality, 'export-quality', 44)}<span>%</span></>}</div>
        <div className="row"><span style={{ width: 70 }}>Artboard</span>
          <select data-testid="export-artboard" style={{ flex: 1 }} disabled={all} value={ab.id} onChange={(e) => { setAbId(e.target.value); const a = ed.doc.artboards.find((x) => x.id === e.target.value)!; setWidth(String(Math.round(a.w))); setTransparent(a.background === null); }}>
            {ed.doc.artboards.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.w}×{a.h})</option>)}
          </select>
          {ed.doc.artboards.length > 1 && <label className="row"><input type="checkbox" data-testid="export-all" checked={all} onChange={(e) => setAll(e.target.checked)} /> All</label>}</div>
        {(raster || format === 'pdf') && (
          <div className="row"><span style={{ width: 70 }}>Bleed</span>{numberInput(bleed, setBleed, 'export-bleed', 50)}<span>units on every side{format === 'pdf' ? ' (PDF TrimBox marks the finished size)' : ' (crop to the artboard size at the printer)'}</span></div>
        )}
        {!bleedOk && <div style={{ color: '#ff9a9a' }} data-testid="export-bleed-error">Bleed must be between 0 and 1000.</div>}
        {raster && <>
          <div className="row"><span style={{ width: 70 }}>Size</span>
            <select data-testid="export-mode" value={mode} onChange={(e) => setMode(e.target.value as 'scale' | 'width')}><option value="scale">Scale</option><option value="width">Width (px)</option></select>
            {mode === 'scale' ? <>{numberInput(scale, setScale, 'export-scale', 60)}<span>×</span></> : numberInput(width, setWidth, 'export-width', 80)}
            <span>Resolution</span>{numberInput(ppi, setPpi, 'export-ppi', 50)}<span>ppi</span></div>
          {format === 'png' && <label className="row"><input type="checkbox" data-testid="export-transparent" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background</label>}
          <div data-testid="export-size" style={{ color: sizeOk ? '#9a9a9a' : '#ff9a9a' }}>
            {sizeOk ? `Output: ${size!.w} × ${size!.h} px${phys ? ` · print size ${phys.inW.toFixed(2)} × ${phys.inH.toFixed(2)} in (${phys.cmW.toFixed(1)} × ${phys.cmH.toFixed(1)} cm) at ${ppiNum} ppi` : ''}` : 'Output size must be between 1 and 16384 px on each side.'}
          </div>
          {!ppiOk && <div style={{ color: '#ff9a9a' }} data-testid="export-ppi-error">Resolution must be between 1 and 2400 ppi.</div>}
        </>}
        {issues.length > 0 && <ul data-testid="export-issues" style={{ margin: 0, paddingLeft: 16, maxHeight: 120, overflow: 'auto' }}>
          {issues.map((i, k) => <li key={k} style={{ color: i.level === 'warn' ? '#e0b341' : '#9a9a9a' }}>{i.text}</li>)}
        </ul>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" data-testid="export-go" disabled={!valid || busy} onClick={async () => {
            setBusy(true);
            const ok = await runExport(app, { format, artboardIds: targets.map((a) => a.id), ...opts, transparent, quality: +quality / 100, ppi: ppiNum, bleed: bleedNum });
            setBusy(false);
            if (ok) {
              const abName = all ? undefined : ab.name;
              if (raster) actions.note('exportRaster', { format, artboard: abName, ...(mode === 'scale' ? { scale: +scale } : { width: Math.round(+width) }), transparent: format === 'png' ? transparent : false, quality: +quality / 100, ppi: ppiNum });
              else if (format === 'svg') actions.note('exportSvg', { artboard: abName });
              else actions.note('exportPdf', { bleed: bleedNum || undefined });
              close();
            }
          }}>Export{targets.length > 1 && format !== 'pdf' ? ` ${targets.length} files` : ''}</button>
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
      <p>Vector Studio 0.2. Offline-first vector editor. Verified on Linux only; Windows is untested. See KNOWN-ISSUES.md for current limitations.</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={close}>Close</button></div>
    </Dialog>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import {
  cleanupDocument, computePalette, DEFAULT_CLEANUP, listColors, reduceColors, replaceColor, type CleanupOptions, type CleanupReport,
} from '../../core/document';
import { placeTrace, traceImage, TRACE_PRESETS, type TraceOptions } from '../../core/io';
import { parseSizes, sizeVariants } from '../../automation/batch';
import { exportPdf, exportSvg } from '../../core/io';
import { exportImage } from '../../render/browser-export';
import { platform } from '../../platform';
import { useApp } from '../hooks';
import { useUi } from '../store';
import { baseName } from '../commands';

function Dlg({ title, children, onClose, testId }: { title: string; children: ReactNode; onClose(): void; testId: string }) {
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-label={title} data-testid={testId} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
const close = () => useUi.getState().openDialog(null);

export function CleanupDialog() {
  const { ed } = useApp();
  const [o, setO] = useState<CleanupOptions>({ ...DEFAULT_CLEANUP });
  const [report, setReport] = useState<CleanupReport | null>(null);
  const bool = (k: keyof CleanupOptions, label: string) => (
    <label className="row"><input type="checkbox" data-testid={`cleanup-${k}`} checked={o[k] as boolean} onChange={(e) => setO({ ...o, [k]: e.target.checked })} /> {label}</label>
  );
  return (
    <Dlg title="Clean Up Vectors" onClose={close} testId="dialog-cleanup">
      <div className="flex flex-col gap-2" style={{ minWidth: 380 }}>
        {bool('removeHidden', 'Remove hidden objects')}
        {bool('removeEmptyGroups', 'Remove empty groups')}
        {bool('removeInvisible', 'Remove objects with no fill and no stroke')}
        <label className="row">Remove shapes smaller than <input type="text" data-testid="cleanup-minArea" style={{ width: 56 }} value={String(o.minArea)} onChange={(e) => { const v = parseFloat(e.target.value); setO({ ...o, minArea: isFinite(v) && v >= 0 ? v : 0 }); }} /> sq. units</label>
        <label className="row">Merge anchor points closer than <input type="text" data-testid="cleanup-mergeDistance" style={{ width: 56 }} value={String(o.mergeDistance)} onChange={(e) => { const v = parseFloat(e.target.value); setO({ ...o, mergeDistance: isFinite(v) && v >= 0 ? v : 0 }); }} /> units</label>
        {report && <div data-testid="cleanup-report" style={{ color: '#9a9a9a' }}>Removed {report.removedObjects} object(s), {report.removedGroups} empty group(s), {report.removedNodes} duplicate anchor(s).</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={close}>Close</button>
          <button className="btn btn-primary" data-testid="cleanup-run" onClick={() => { let r: CleanupReport | null = null; ed.apply('Clean up', (d) => { r = cleanupDocument(d, o); }); setReport(r); }}>Clean up</button>
        </div>
      </div>
    </Dlg>
  );
}

export function ColorsDialog() {
  const { ed } = useApp();
  const colors = listColors(ed.doc);
  const [n, setN] = useState('6');
  const [from, setFrom] = useState(colors[0]?.color ?? '#000000');
  const [to, setTo] = useState('#000000');
  const [msg, setMsg] = useState('');
  const target = Math.max(1, Math.min(256, Math.round(+n) || 1));
  const preview = useMemo(() => computePalette(colors, target), [colors, target]);
  const sw = (c: string, k?: string) => <span key={k ?? c} title={c} style={{ display: 'inline-block', width: 18, height: 18, background: c, border: '1px solid #666', marginRight: 2 }} />;
  return (
    <Dlg title="Colors – reduce or replace" onClose={close} testId="dialog-colors">
      <div className="flex flex-col gap-3" style={{ minWidth: 420 }}>
        <div data-testid="colors-current">{colors.length} distinct colour{colors.length === 1 ? '' : 's'} in use: {colors.slice(0, 40).map((c) => sw(c.color))}</div>
        <div className="row">Reduce to <input type="text" data-testid="colors-target" style={{ width: 46 }} value={n} onChange={(e) => setN(e.target.value)} /> colours
          <span data-testid="colors-preview">→ {preview.map((c) => sw(c, 'p' + c))}</span></div>
        <div className="row"><button className="btn btn-primary" data-testid="colors-reduce" disabled={colors.length === 0} onClick={() => { let res = { palette: [] as string[], changed: 0 }; ed.apply('Reduce colors', (d) => { res = reduceColors(d, target); }); setMsg(`${colors.length} → ${res.palette.length} colours (${res.changed} paints changed)`); }}>Reduce colours</button></div>
        <div className="row">Replace <input type="color" data-testid="colors-from" value={from} onChange={(e) => setFrom(e.target.value)} /> with <input type="color" data-testid="colors-to" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn" data-testid="colors-replace" onClick={() => { let c = 0; ed.apply('Replace color', (d) => { c = replaceColor(d, from, to); }); setMsg(`Replaced ${c} paint(s)`); }}>Replace</button></div>
        {msg && <div data-testid="colors-msg" style={{ color: '#9a9a9a' }}>{msg}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={close}>Close</button></div>
      </div>
    </Dlg>
  );
}

export function TraceDialog() {
  const { ed } = useApp();
  const ti = useUi((s) => s.traceImage);
  const [preset, setPreset] = useState('logo');
  const [o, setO] = useState<TraceOptions>({ ...TRACE_PRESETS.logo.options });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!ti) return null;
  const done = () => { useUi.getState().setTraceImage(null); close(); };
  return (
    <Dlg title={`Trace image – ${ti.name}`} onClose={done} testId="dialog-trace">
      <div className="flex flex-col gap-2" style={{ minWidth: 400 }}>
        <div className="text-mute" data-testid="trace-info">{ti.image.width}×{ti.image.height} px{ti.scaledFrom ? ` (scaled down from ${ti.scaledFrom[0]}×${ti.scaledFrom[1]} for tracing)` : ''}</div>
        <div className="row"><span style={{ width: 70 }}>Preset</span>
          <select data-testid="trace-preset" style={{ flex: 1 }} value={preset} onChange={(e) => { setPreset(e.target.value); setO({ ...TRACE_PRESETS[e.target.value].options }); }}>
            {Object.entries(TRACE_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></div>
        <div className="row"><span style={{ width: 70 }}>Colours</span><input type="text" data-testid="trace-colors" style={{ width: 46 }} value={o.colors} onChange={(e) => setO({ ...o, colors: Math.max(2, Math.min(64, +e.target.value || 2)) })} />
          <span>Detail</span><select data-testid="trace-detail" value={o.detail} onChange={(e) => setO({ ...o, detail: e.target.value as TraceOptions['detail'] })}><option value="low">Low (smooth)</option><option value="medium">Medium</option><option value="high">High</option></select></div>
        <label className="row"><input type="checkbox" data-testid="trace-bg" checked={o.removeBackground} onChange={(e) => setO({ ...o, removeBackground: e.target.checked })} /> Remove background colour (colour of the top-left pixel)</label>
        {err && <div style={{ color: '#ff9a9a' }} data-testid="trace-error">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={done}>Cancel</button>
          <button className="btn btn-primary" data-testid="trace-go" disabled={busy} onClick={() => {
            setBusy(true); setErr('');
            setTimeout(() => {
              try {
                const t = traceImage(ti.image, o);
                if (t.pathCount === 0) { setErr('Nothing was traced. Try more colours or turn off background removal.'); setBusy(false); return; }
                const a = ed.activeArtboard;
                const g = placeTrace(t, a.x + a.w / 2, a.y + a.h / 2, a.w * 0.9, a.h * 0.9);
                ed.apply('Trace image', (d) => { d.layers.find((l) => l.id === ed.activeLayerId)!.children.push(g); });
                ed.select([g.id]);
                useUi.getState().notify(`Traced into ${t.pathCount} editable shapes`);
                done();
              } catch (e) { setErr((e as Error).message); setBusy(false); }
            }, 20);
          }}>{busy ? 'Tracing…' : 'Trace'}</button>
        </div>
      </div>
    </Dlg>
  );
}

export function BatchDialog() {
  const app = useApp();
  const ed = app.ed;
  const [abId, setAbId] = useState(ed.activeArtboardId);
  const [sizes, setSizes] = useState('4500x5400 large\n3000x3600 medium\n1500x1800 small');
  const [mode, setMode] = useState<'fit' | 'fill' | 'none'>('fit');
  const [format, setFormat] = useState<'png' | 'jpeg' | 'pdf' | 'svg'>('png');
  const [transparent, setTransparent] = useState(true);
  const [ppi, setPpi] = useState(String(ed.doc.ppi));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => { try { return { list: parseSizes(sizes), error: '' }; } catch (e) { return { list: [], error: (e as Error).message }; } }, [sizes]);
  const run = async () => {
    setBusy(true); setMsg('');
    try {
      const variants = sizeVariants(ed.doc, abId, parsed.list, mode);
      const base = baseName(ed.fileName ?? ed.doc.name).replace(/[^\w.\- ]+/g, '_');
      const files: { name: string; data: string | Uint8Array; mime: string }[] = [];
      for (const v of variants) {
        const name = `${base}-${v.name.replace(/[^\w.\- ]+/g, '_')}`;
        if (format === 'svg') files.push({ name: `${name}.svg`, data: exportSvg(v.doc, v.artboard), mime: 'image/svg+xml' });
        else if (format === 'pdf') files.push({ name: `${name}.pdf`, data: exportPdf(v.doc, [v.artboard]), mime: 'application/pdf' });
        else {
          const out = await exportImage(v.doc, v.artboard, { format, scale: 1, transparent, ppi: +ppi || v.doc.ppi, quality: 0.92 });
          files.push({ name: `${name}.${format === 'jpeg' ? 'jpg' : 'png'}`, data: out.bytes, mime: format === 'jpeg' ? 'image/jpeg' : 'image/png' });
        }
      }
      const saved = await platform.saveFiles(files);
      if (saved) { useUi.getState().notify(`Exported ${saved.length} files`); close(); }
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dlg title="Batch resize & export" onClose={close} testId="dialog-batch">
      <div className="flex flex-col gap-2" style={{ minWidth: 440 }}>
        <div className="row"><span style={{ width: 70 }}>Artboard</span>
          <select data-testid="batch-artboard" style={{ flex: 1 }} value={abId} onChange={(e) => setAbId(e.target.value)}>{ed.doc.artboards.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.w}×{a.h})</option>)}</select></div>
        <div>Sizes — one per line, WIDTHxHEIGHT and an optional name</div>
        <textarea data-testid="batch-sizes" rows={4} value={sizes} onChange={(e) => setSizes(e.target.value)} style={{ background: '#1b1b1b', border: '1px solid #3d3d3d', color: 'inherit', padding: 4, userSelect: 'text' }} />
        {parsed.error && <div style={{ color: '#ff9a9a' }} data-testid="batch-error">{parsed.error}</div>}
        <div className="row"><span style={{ width: 70 }}>Content</span>
          <select data-testid="batch-mode" value={mode} onChange={(e) => setMode(e.target.value as 'fit')}><option value="fit">Scale to fit</option><option value="fill">Scale to fill</option><option value="none">Keep size</option></select>
          <span>Format</span><select data-testid="batch-format" value={format} onChange={(e) => setFormat(e.target.value as 'png')}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="pdf">PDF</option><option value="svg">SVG</option></select></div>
        <div className="row">{(format === 'png') && <label className="row"><input type="checkbox" data-testid="batch-transparent" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent</label>}
          {(format === 'png' || format === 'jpeg') && <><span>Resolution</span><input type="text" data-testid="batch-ppi" style={{ width: 50 }} value={ppi} onChange={(e) => setPpi(e.target.value)} /><span>ppi</span></>}</div>
        {msg && <div style={{ color: '#ff9a9a' }} data-testid="batch-msg">{msg}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" data-testid="batch-go" disabled={busy || !!parsed.error} onClick={run}>{busy ? 'Exporting…' : `Export ${parsed.list.length} file(s)`}</button>
        </div>
      </div>
    </Dlg>
  );
}

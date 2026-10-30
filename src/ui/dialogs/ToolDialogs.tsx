import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { runActionBatch, type BatchFileResult } from '../../automation/batch-actions';
import type { ExportedFile } from '../../automation/steps';
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
import { actions } from '../actions-service';
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
  const app = useApp();
  const { ed } = app;
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
          <button className="btn btn-primary" data-testid="cleanup-run" onClick={() => { let r: CleanupReport | null = null; ed.apply('Clean up', (d) => { r = cleanupDocument(d, o); }); setReport(r); actions.note('cleanup', { options: o }); }}>Clean up</button>
        </div>
      </div>
    </Dlg>
  );
}

export function ColorsDialog() {
  const app = useApp();
  const { ed } = app;
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
        <div className="row"><button className="btn btn-primary" data-testid="colors-reduce" disabled={colors.length === 0} onClick={() => { let res = { palette: [] as string[], changed: 0 }; ed.apply('Reduce colors', (d) => { res = reduceColors(d, target); }); actions.note('reduceColors', { max: target }); setMsg(`${colors.length} → ${res.palette.length} colours (${res.changed} paints changed)`); }}>Reduce colours</button></div>
        <div className="row">Replace <input type="color" data-testid="colors-from" value={from} onChange={(e) => setFrom(e.target.value)} /> with <input type="color" data-testid="colors-to" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn" data-testid="colors-replace" onClick={() => { let c = 0; ed.apply('Replace color', (d) => { c = replaceColor(d, from, to); }); actions.note('replaceColor', { from, to }); setMsg(`Replaced ${c} paint(s)`); }}>Replace</button></div>
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

export function OffsetDialog() {
  const { ed } = useApp();
  const [dist, setDist] = useState('10');
  const [join, setJoin] = useState<'round' | 'miter' | 'bevel'>('round');
  const d = parseFloat(dist);
  const ok = isFinite(d) && d !== 0 && Math.abs(d) <= 5000;
  return (
    <Dlg title="Offset Path" onClose={close} testId="dialog-offset">
      <div className="flex flex-col gap-3" style={{ minWidth: 340 }}>
        <div className="row"><span style={{ width: 70 }}>Distance</span><input type="text" data-testid="offset-distance" style={{ width: 70 }} value={dist} onChange={(e) => setDist(e.target.value)} /><span>units (negative shrinks)</span></div>
        <div className="row"><span style={{ width: 70 }}>Corners</span>
          <select data-testid="offset-join" value={join} onChange={(e) => setJoin(e.target.value as 'round')}><option value="round">Round</option><option value="miter">Miter</option><option value="bevel">Bevel</option></select></div>
        {!ok && <div style={{ color: '#ff9a9a' }} data-testid="offset-error">Enter a distance other than 0 (at most 5000).</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" data-testid="offset-go" disabled={!ok} onClick={() => { if (ed.offsetSelection(d, join) > 0) { actions.note('offsetPath', { distance: d, join }); close(); } }}>Offset</button>
        </div>
      </div>
    </Dlg>
  );
}

interface PickedFile { name: string; text: string }

export function BatchActionsDialog() {
  const lib = actions.library;
  useSyncExternalStore((f) => actions.subscribe(f), () => actions.version);
  const preselect = useUi((s) => s.batchAction);
  const all = lib.sets.flatMap((s) => s.actions.map((a) => ({ ...a, set: s.name })));
  const [actionId, setActionId] = useState(preselect ?? all[0]?.id ?? '');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [pattern, setPattern] = useState('{file}');
  const [retries, setRetries] = useState('0');
  const [cont, setCont] = useState(true);
  const [saveProcessed, setSaveProcessed] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ i: 0, n: 0, name: '' });
  const [results, setResults] = useState<BatchFileResult[] | null>(null);
  const [outputs, setOutputs] = useState<ExportedFile[]>([]);
  const [err, setErr] = useState('');
  const [signal] = useState(() => ({ aborted: false }));
  const action = lib.find(actionId)?.action ?? null;

  const add = async (folder: boolean) => {
    const f = await platform.openTextFiles(['.vstudio'], folder);
    if (!f) return;
    setFiles((cur) => [...cur, ...f.filter((x) => !cur.some((c) => c.name === x.name))]);
  };
  const run = async () => {
    if (!action) return;
    setErr(''); setResults(null); setOutputs([]); signal.aborted = false; setRunning(true);
    try {
      const r = await runActionBatch(files, {
        action, namePattern: pattern, retries: Math.max(0, Math.min(5, Math.round(+retries) || 0)), continueOnError: cont, saveResultIfNoExport: saveProcessed, signal,
        rasterize: async (doc, ab, o) => (await exportImage(doc, ab, { format: o.format, scale: o.scale, width: o.width, transparent: o.transparent, quality: o.quality, ppi: o.ppi })).bytes,
        onFile: (i, n, name) => { setProgress({ i, n, name }); return undefined; },
      });
      setResults(r.files); setOutputs(r.outputs);
    } catch (e) { setErr((e as Error).message); } finally { setRunning(false); }
  };
  const logText = () => (results ?? []).map((f) => `${f.status.toUpperCase().padEnd(9)} ${f.name}${f.error ? ` – ${f.error}` : ''}${f.outputs.length ? ` → ${f.outputs.join(', ')}` : ''} (${Math.round(f.ms)} ms, ${f.attempts} attempt(s))`).join('\n');
  const ok = (results ?? []).filter((r) => r.status === 'ok').length;

  return (
    <Dlg title="Batch process with an action" onClose={() => { signal.aborted = true; close(); }} testId="dialog-batch-actions">
      <div className="flex flex-col gap-2" style={{ minWidth: 520 }}>
        <div className="row"><span style={{ width: 70 }}>Action</span>
          <select data-testid="ba-action" style={{ flex: 1 }} value={actionId} onChange={(e) => setActionId(e.target.value)} disabled={running}>
            {all.map((a) => <option key={a.id} value={a.id}>{a.set} › {a.name} ({a.steps.filter((s) => s.enabled).length} steps)</option>)}
          </select></div>
        <div className="row"><button className="btn" data-testid="ba-add" disabled={running} onClick={() => add(false)}>Add files…</button>
          <button className="btn" data-testid="ba-add-folder" disabled={running} onClick={() => add(true)}>Add folder…</button>
          <button className="btn" disabled={running || !files.length} onClick={() => setFiles([])}>Clear</button><span className="text-mute" data-testid="ba-count">{files.length} file(s)</span></div>
        <div className="border border-edge" style={{ maxHeight: 90, overflow: 'auto', background: '#262626' }} data-testid="ba-files">
          {files.map((f) => <div key={f.name} className="layer-row"><span style={{ flex: 1 }}>{f.name}</span><button className="icon-btn" style={{ width: 18, height: 18 }} aria-label={`Remove ${f.name}`} disabled={running} onClick={() => setFiles(files.filter((x) => x !== f))}>×</button></div>)}
        </div>
        <div className="row"><span style={{ width: 70 }}>Naming</span><input type="text" data-testid="ba-pattern" style={{ flex: 1 }} value={pattern} onChange={(e) => setPattern(e.target.value)} disabled={running} title="Tokens: {file} {name} {n} {date}" /></div>
        <div className="row"><label className="row"><input type="checkbox" data-testid="ba-continue" checked={cont} onChange={(e) => setCont(e.target.checked)} disabled={running} /> Keep going after a failure</label>
          <span>Retries</span><input type="text" data-testid="ba-retries" style={{ width: 34 }} value={retries} onChange={(e) => setRetries(e.target.value)} disabled={running} />
          <label className="row"><input type="checkbox" checked={saveProcessed} onChange={(e) => setSaveProcessed(e.target.checked)} disabled={running} /> Save processed copy when the action exports nothing</label></div>
        <div className="text-mute">Original files are never changed; results are saved as new files. Steps that need a person cannot run in a batch.</div>
        {running && <div data-testid="ba-progress">Processing {progress.i + 1} of {progress.n}: {progress.name}</div>}
        {err && <div style={{ color: '#ff9a9a' }} data-testid="ba-error">{err}</div>}
        {results && (
          <div data-testid="ba-results">
            <div data-testid="ba-summary">{ok} succeeded, {results.filter((r) => r.status === 'failed').length} failed, {results.filter((r) => r.status === 'skipped' || r.status === 'cancelled').length} not run</div>
            <pre style={{ maxHeight: 110, overflow: 'auto', margin: 0, userSelect: 'text', fontSize: 11 }} data-testid="ba-log">{logText()}</pre>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {results && <button className="btn" data-testid="ba-save-log" onClick={() => void platform.saveFile({ suggestedName: 'batch-log', ext: 'txt', data: logText(), mime: 'text/plain', forceDialog: true })}>Save log</button>}
          {results && outputs.length > 0 && <button className="btn btn-primary" data-testid="ba-save" onClick={async () => { const s = await platform.saveFiles(outputs); if (s) useUi.getState().notify(`Saved ${s.length} file(s)`); }}>Save {outputs.length} output file(s)…</button>}
          {running ? <button className="btn" data-testid="ba-cancel" onClick={() => { signal.aborted = true; }}>Cancel</button> : <button className="btn" onClick={close}>Close</button>}
          <button className="btn btn-primary" data-testid="ba-run" disabled={running || !action || files.length === 0} onClick={run}>Run batch</button>
        </div>
      </div>
    </Dlg>
  );
}

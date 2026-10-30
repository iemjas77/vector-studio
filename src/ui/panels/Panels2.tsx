import { useState } from 'react';
import { getElement, listColors, type Element } from '../../core/document';
import { fonts } from '../../core/text';
import { NumField } from '../controls';
import { doStep } from '../commands';
import { useApp } from '../hooks';

export function PathfinderPanel() {
  const app = useApp();
  const n = app.ed.selection.length;
  const sel = app.ed.selectedElements;
  const B = (id: string, label: string, title: string, on: () => void, disabled = n < 2) => <button key={id} className="btn" style={{ minWidth: 70 }} data-testid={`pf-${id}`} title={title} disabled={disabled} onClick={on}>{label}</button>;
  return (
    <div className="flex flex-col gap-2" data-testid="pathfinder-panel">
      <div className="text-mute">Shape modes (select 2 or more objects)</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {B('unite', 'Unite', 'Add the shapes together', () => doStep(app, 'boolean', { op: 'unite' }))}
        {B('subtract', 'Minus Front', 'Subtract the front shapes from the back one', () => doStep(app, 'boolean', { op: 'subtract' }))}
        {B('intersect', 'Intersect', 'Keep only the overlap', () => doStep(app, 'boolean', { op: 'intersect' }))}
        {B('exclude', 'Exclude', 'Remove the overlap', () => doStep(app, 'boolean', { op: 'exclude' }))}
      </div>
      <div className="text-mute">Other</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {B('compound', 'Make Compound', 'Holes where shapes overlap', () => doStep(app, 'makeCompound'))}
        {B('release', 'Release', 'Split a compound path', () => doStep(app, 'releaseCompound'), !sel.some((e) => e.type === 'path' && e.extra.length > 0))}
        {B('outline', 'Outline Stroke', 'Turn strokes into filled shapes', () => doStep(app, 'expandStroke'), !sel.some((e) => e.type !== 'group' && !!e.stroke && e.stroke.width > 0))}
        {B('clip', 'Clip', 'Make a clipping mask (top object is the mask)', () => doStep(app, 'makeClip'))}
      </div>
    </div>
  );
}

export function TransformPanel() {
  const app = useApp();
  const none = app.ed.selection.length === 0;
  const [rot, setRot] = useState(0), [shear, setShear] = useState(0), [sx, setSx] = useState(100), [sy, setSy] = useState(100), [lock, setLock] = useState(true);
  const [te, setTe] = useState({ scale: 100, rotate: 0, moveX: 0, moveY: 0 });
  const b = app.ed.selectionBounds();
  return (
    <div className="flex flex-col gap-2" data-testid="transform-panel">
      <div className="text-mute">{b ? `Selection ${b.w.toFixed(1)} × ${b.h.toFixed(1)} at ${b.x.toFixed(1)}, ${b.y.toFixed(1)}` : 'No selection'}</div>
      <div className="row"><NumField testId="tf-rotate" label="∠" value={rot} decimals={2} width={60} unit="°" disabled={none} onCommit={setRot} /><button className="btn" data-testid="tf-rotate-go" disabled={none || rot === 0} onClick={() => doStep(app, 'rotate', { degrees: rot })}>Rotate</button></div>
      <div className="row"><NumField testId="tf-shear" label="⧄" value={shear} decimals={2} width={60} unit="°" min={-85} max={85} disabled={none} onCommit={setShear} /><button className="btn" data-testid="tf-shear-go" disabled={none || shear === 0} onClick={() => doStep(app, 'shear', { degrees: shear })}>Shear</button></div>
      <div className="row">
        <NumField testId="tf-sx" label="W" value={sx} decimals={2} width={56} unit="%" min={0.1} disabled={none} onCommit={(v) => { setSx(v); if (lock) setSy(v); }} />
        <NumField testId="tf-sy" label="H" value={sy} decimals={2} width={56} unit="%" min={0.1} disabled={none} onCommit={(v) => { setSy(v); if (lock) setSx(v); }} />
        <label className="row"><input type="checkbox" data-testid="tf-lock" checked={lock} onChange={(e) => setLock(e.target.checked)} />🔗</label>
        <button className="btn" data-testid="tf-scale-go" disabled={none} onClick={() => doStep(app, 'scaleXY', { x: sx, y: sy })}>Scale</button>
      </div>
      <div className="row"><button className="btn" data-testid="tf-flip-h" disabled={none} onClick={() => doStep(app, 'reflect', { axis: 'horizontal' })}>Flip horizontal</button><button className="btn" data-testid="tf-flip-v" disabled={none} onClick={() => doStep(app, 'reflect', { axis: 'vertical' })}>Flip vertical</button></div>
      <div className="text-mute">Transform Each (about each object’s own centre)</div>
      <div className="grid grid-cols-2 gap-1">
        <NumField testId="te-scale" label="%" value={te.scale} min={0.1} width={56} disabled={none} onCommit={(v) => setTe({ ...te, scale: v })} />
        <NumField testId="te-rotate" label="∠" value={te.rotate} width={56} disabled={none} onCommit={(v) => setTe({ ...te, rotate: v })} />
        <NumField testId="te-movex" label="X" value={te.moveX} width={56} disabled={none} onCommit={(v) => setTe({ ...te, moveX: v })} />
        <NumField testId="te-movey" label="Y" value={te.moveY} width={56} disabled={none} onCommit={(v) => setTe({ ...te, moveY: v })} />
      </div>
      <button className="btn" data-testid="te-go" disabled={none} onClick={() => doStep(app, 'transformEach', { scale: te.scale, rotate: te.rotate, moveX: te.moveX, moveY: te.moveY })}>Apply to each</button>
    </div>
  );
}

export function DocumentInfoPanel() {
  const { ed } = useApp();
  const doc = ed.doc;
  const counts: Record<string, number> = {};
  const families = new Set<string>();
  const walk = (els: Element[]) => els.forEach((e) => { counts[e.type] = (counts[e.type] ?? 0) + 1; if (e.type === 'text') families.add(e.fontFamily); if (e.type === 'group') walk(e.children); });
  doc.layers.forEach((l) => walk(l.children));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const colors = listColors(doc);
  const loaded = new Set(fonts.families().map((f) => f.toLowerCase()));
  const missing = [...families].filter((f) => !loaded.has(f.toLowerCase()));
  const sel = ed.selection.length === 1 ? getElement(doc, ed.selection[0]) : null;
  return (
    <div className="flex flex-col gap-1" data-testid="docinfo-panel">
      <div><b>{doc.name}</b> · {doc.ppi} ppi · format v{doc.version}</div>
      <div data-testid="di-counts">{doc.artboards.length} artboard(s), {doc.layers.length} layer(s), {total} object(s){total ? ` (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}</div>
      <div data-testid="di-colors">{colors.length} colour(s): {colors.slice(0, 24).map((c) => <span key={c.color} title={`${c.color} ×${c.count}`} style={{ display: 'inline-block', width: 12, height: 12, background: c.color, border: '1px solid #666', marginRight: 2 }} />)}</div>
      <div data-testid="di-fonts">Fonts: {families.size ? [...families].join(', ') : 'none'}</div>
      {missing.length > 0 && <div style={{ color: '#e0b341' }} data-testid="di-missing-fonts">Missing fonts (a substitute is used): {missing.join(', ')}</div>}
      {sel && <div className="text-mute">Selected: {sel.name} ({sel.type})</div>}
    </div>
  );
}

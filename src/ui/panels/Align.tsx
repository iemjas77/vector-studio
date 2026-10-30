import { useState } from 'react';
import type { AlignMode, DistributeMode } from '../../core/document';
import { useApp } from '../hooks';
import { doStep } from '../commands';

const ALIGN: { mode: AlignMode; label: string; glyph: string }[] = [
  { mode: 'left', label: 'Align left edges', glyph: '⇤' }, { mode: 'hcenter', label: 'Align horizontal centres', glyph: '⇹' }, { mode: 'right', label: 'Align right edges', glyph: '⇥' },
  { mode: 'top', label: 'Align top edges', glyph: '⤒' }, { mode: 'vcenter', label: 'Align vertical centres', glyph: '⇕' }, { mode: 'bottom', label: 'Align bottom edges', glyph: '⤓' },
];
const DIST: { mode: DistributeMode; label: string; glyph: string }[] = [
  { mode: 'hcenters', label: 'Distribute horizontal centres', glyph: '⋮⋮' }, { mode: 'hspace', label: 'Equal horizontal spacing', glyph: '↔' },
  { mode: 'vcenters', label: 'Distribute vertical centres', glyph: '≡' }, { mode: 'vspace', label: 'Equal vertical spacing', glyph: '↕' },
];

export function AlignPanel() {
  const app = useApp();
  const { ed } = app;
  const [toArtboard, setToArtboard] = useState(false);
  const n = ed.selection.length;
  return (
    <div className="flex flex-col gap-2" data-testid="align-panel">
      <label className="row"><input type="checkbox" data-testid="align-artboard" checked={toArtboard} onChange={(e) => setToArtboard(e.target.checked)} /> Align to artboard {n === 1 && '(single object always uses the artboard)'}</label>
      <div className="row">{ALIGN.map((a) => <button key={a.mode} className="btn" style={{ width: 36 }} title={a.label} aria-label={a.label} data-testid={`align-${a.mode}`} disabled={n === 0} onClick={() => doStep(app, 'align', { mode: a.mode, toArtboard })}>{a.glyph}</button>)}</div>
      <div className="row">{DIST.map((a) => <button key={a.mode} className="btn" style={{ width: 36 }} title={`${a.label} (needs 3+ objects)`} aria-label={a.label} data-testid={`dist-${a.mode}`} disabled={n < 3} onClick={() => doStep(app, 'distribute', { mode: a.mode })}>{a.glyph}</button>)}</div>
    </div>
  );
}

import type { LineCap, LineJoin } from '../../core/document';
import { NumField } from '../controls';
import { useApp } from '../hooks';

const CAPS: LineCap[] = ['butt', 'round', 'square'];
const JOINS: LineJoin[] = ['miter', 'round', 'bevel'];

export function StrokePanel() {
  const { ed } = useApp();
  const s = ed.currentStroke;
  const off = !s;
  const dashed = !!s && s.dash.length > 0;
  return (
    <div className="flex flex-col gap-2" data-testid="stroke-panel">
      <div className="row"><span className="text-mute" style={{ width: 52 }}>Weight</span>
        <NumField testId="stroke-width" value={s?.width ?? null} min={0} max={1000} step={0.5} width={56} unit="px" disabled={off} onCommit={(v) => ed.updateStroke({ width: v })} /></div>
      <div className="row"><span className="text-mute" style={{ width: 52 }}>Cap</span>
        {CAPS.map((c) => <button key={c} className="btn" data-testid={`cap-${c}`} aria-pressed={s?.cap === c} disabled={off} style={{ background: s?.cap === c ? '#3d5f94' : undefined }} onClick={() => ed.updateStroke({ cap: c })}>{c}</button>)}</div>
      <div className="row"><span className="text-mute" style={{ width: 52 }}>Corner</span>
        {JOINS.map((j) => <button key={j} className="btn" data-testid={`join-${j}`} aria-pressed={s?.join === j} disabled={off} style={{ background: s?.join === j ? '#3d5f94' : undefined }} onClick={() => ed.updateStroke({ join: j })}>{j}</button>)}</div>
      <div className="row"><span className="text-mute" style={{ width: 52 }}>Miter</span>
        <NumField testId="stroke-miter" value={s?.miterLimit ?? null} min={1} max={500} width={56} disabled={off || s?.join !== 'miter'} onCommit={(v) => ed.updateStroke({ miterLimit: v })} /></div>
      <div className="row"><label className="row"><input type="checkbox" data-testid="stroke-dashed" checked={dashed} disabled={off} onChange={(e) => ed.updateStroke({ dash: e.target.checked ? [Math.max(4, (s?.width ?? 1) * 3), Math.max(4, (s?.width ?? 1) * 3)] : [] })} /> Dashed</label>
        {dashed && <>
          <NumField testId="dash-len" label="dash" value={s!.dash[0]} min={0} width={44} onCommit={(v) => ed.updateStroke({ dash: [v, s!.dash[1] ?? v] })} />
          <NumField testId="gap-len" label="gap" value={s!.dash[1] ?? s!.dash[0]} min={0} width={44} onCommit={(v) => ed.updateStroke({ dash: [s!.dash[0], v] })} />
        </>}</div>
    </div>
  );
}

import { solid, solidOf } from '../core/document';
import { NumField } from './controls';
import { useApp } from './hooks';

/** Context bar under the tabs: quick appearance controls that mirror the selection (or defaults when nothing is selected). */
export function OptionsBar() {
  const { ed } = useApp();
  const fill = ed.currentFill, stroke = ed.currentStroke;
  return (
    <div className="row px-3 bg-panel border-b border-edge" style={{ height: 34, gap: 12 }} data-testid="optionsbar">
      <span className="text-mute" data-testid="options-tool">{ed.tool.label}</span>
      <span className="row">Fill
        <input type="color" aria-label="Quick fill colour" data-testid="quick-fill" value={fill ? solidOf(fill).color : '#ffffff'} onChange={(e) => ed.setFill(solid(e.target.value, fill ? solidOf(fill).alpha : 1))} style={{ width: 28, height: 22, padding: 0, opacity: fill ? 1 : 0.35 }} />
        <button className="btn" data-testid="quick-fill-none" onClick={() => ed.setFill(null)} aria-pressed={!fill}>None</button>
      </span>
      <span className="row">Stroke
        <input type="color" aria-label="Quick stroke colour" data-testid="quick-stroke" value={stroke?.paint.color ?? '#000000'} onChange={(e) => ed.updateStroke({ paint: solid(e.target.value, stroke?.paint.alpha ?? 1) })} style={{ width: 28, height: 22, padding: 0, opacity: stroke ? 1 : 0.35 }} />
        <NumField testId="quick-stroke-width" value={stroke?.width ?? null} min={0} max={1000} step={0.5} width={46} unit="px" onCommit={(v) => ed.updateStroke({ width: v })} />
        <button className="btn" data-testid="quick-stroke-none" onClick={() => ed.updateStroke(null)} aria-pressed={!stroke}>None</button>
      </span>
      <ToolOptionFields />
      <span style={{ flex: 1 }} />
      <span className="text-mute">{ed.doc.ppi} ppi · units: px</span>
    </div>
  );
}

/** Settings that belong to the active tool (shown only when they matter). */
function ToolOptionFields() {
  const { ed } = useApp();
  const o = ed.toolOptions;
  const set = (patch: Partial<typeof o>) => { Object.assign(ed.toolOptions, patch); ed.emit(); };
  switch (ed.toolId) {
    case 'polygon': return <NumField testId="opt-sides" label="Sides" value={o.sides} min={3} max={100} decimals={0} width={44} onCommit={(v) => set({ sides: Math.round(v) })} />;
    case 'star': return <span className="row"><NumField testId="opt-points" label="Points" value={o.starPoints} min={3} max={100} decimals={0} width={44} onCommit={(v) => set({ starPoints: Math.round(v) })} /><NumField testId="opt-ratio" label="Inner" value={o.starRatio * 100} min={1} max={99} decimals={0} width={44} unit="%" onCommit={(v) => set({ starRatio: v / 100 })} /></span>;
    case 'rrect': return <NumField testId="opt-radius" label="Radius" value={o.cornerRadius} min={0} max={5000} width={52} onCommit={(v) => set({ cornerRadius: v })} />;
    case 'arc': return <NumField testId="opt-sweep" label="Sweep" value={o.arcSweep} min={-360} max={360} decimals={0} width={52} unit="°" onCommit={(v) => set({ arcSweep: v })} />;
    case 'spiral': return <span className="row"><NumField testId="opt-turns" label="Turns" value={o.spiralTurns} min={0.25} max={50} width={44} onCommit={(v) => set({ spiralTurns: v })} /><NumField testId="opt-decay" label="Decay" value={o.spiralDecay * 100} min={30} max={99} decimals={0} width={44} unit="%" onCommit={(v) => set({ spiralDecay: v / 100 })} /></span>;
    case 'pencil': return <NumField testId="opt-tolerance" label="Smooth" value={o.pencilTolerance} min={0.5} max={30} width={44} unit="px" onCommit={(v) => set({ pencilTolerance: v })} />;
    default: return null;
  }
}

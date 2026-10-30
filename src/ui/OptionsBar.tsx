import { solid } from '../core/document';
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
        <input type="color" aria-label="Quick fill colour" data-testid="quick-fill" value={fill?.color ?? '#ffffff'} onChange={(e) => ed.setFill(solid(e.target.value, fill?.alpha ?? 1))} style={{ width: 28, height: 22, padding: 0, opacity: fill ? 1 : 0.35 }} />
        <button className="btn" data-testid="quick-fill-none" onClick={() => ed.setFill(null)} aria-pressed={!fill}>None</button>
      </span>
      <span className="row">Stroke
        <input type="color" aria-label="Quick stroke colour" data-testid="quick-stroke" value={stroke?.paint.color ?? '#000000'} onChange={(e) => ed.updateStroke({ paint: solid(e.target.value, stroke?.paint.alpha ?? 1) })} style={{ width: 28, height: 22, padding: 0, opacity: stroke ? 1 : 0.35 }} />
        <NumField testId="quick-stroke-width" value={stroke?.width ?? null} min={0} max={1000} step={0.5} width={46} unit="px" onCommit={(v) => ed.updateStroke({ width: v })} />
        <button className="btn" data-testid="quick-stroke-none" onClick={() => ed.updateStroke(null)} aria-pressed={!stroke}>None</button>
      </span>
      <span style={{ flex: 1 }} />
      <span className="text-mute">{ed.doc.ppi} ppi · units: px</span>
    </div>
  );
}

import { NumField } from '../controls';
import { useApp } from '../hooks';

export function PropertiesPanel() {
  const { ed } = useApp();
  const b = ed.selectionBounds();
  const sel = ed.selectedElements;
  const none = sel.length === 0;
  const opacity = sel.length ? sel[0].opacity : null;
  return (
    <div className="flex flex-col gap-2" data-testid="properties">
      {none ? (
        <div className="text-mute">No selection. Active artboard: {ed.activeArtboard.name} ({ed.activeArtboard.w}×{ed.activeArtboard.h}px)</div>
      ) : (
        <div className="text-mute">{sel.length === 1 ? `${sel[0].name} (${sel[0].type})` : `${sel.length} objects`}</div>
      )}
      <div className="grid grid-cols-2 gap-1">
        <NumField testId="prop-x" label="X" value={b?.x ?? null} disabled={none} onCommit={(v) => ed.setBounds({ x: v })} />
        <NumField testId="prop-y" label="Y" value={b?.y ?? null} disabled={none} onCommit={(v) => ed.setBounds({ y: v })} />
        <NumField testId="prop-w" label="W" value={b?.w ?? null} disabled={none} min={0.01} onCommit={(v) => ed.setBounds({ w: v })} />
        <NumField testId="prop-h" label="H" value={b?.h ?? null} disabled={none} min={0.01} onCommit={(v) => ed.setBounds({ h: v })} />
      </div>
      <div className="row">
        <span className="text-mute">Opacity</span>
        <NumField testId="prop-opacity" value={opacity === null ? null : opacity * 100} min={0} max={100} decimals={0} width={48} unit="%" disabled={none} onCommit={(v) => ed.setOpacity(v / 100)} />
      </div>
    </div>
  );
}

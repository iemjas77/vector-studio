import { NumField } from './controls';
import { useApp } from './hooks';

export function StatusBar() {
  const { ed } = useApp();
  const h = ed.hover;
  return (
    <div className="flex items-center gap-4 px-3 bg-panel border-t border-edge text-mute" style={{ height: 24 }} data-testid="statusbar">
      <span className="row">Zoom <NumField testId="zoom-input" value={ed.viewport.zoom * 100} min={2} max={6400} decimals={0} width={52} unit="%" onCommit={(v) => ed.zoomTo(v / 100)} /></span>
      <span data-testid="status-tool">{ed.tool.label}</span>
      <span data-testid="status-coords" style={{ minWidth: 110 }}>{h ? `X ${h.x.toFixed(1)}  Y ${h.y.toFixed(1)}` : ''}</span>
      <span data-testid="status-artboard">{ed.activeArtboard.name}: {ed.activeArtboard.w}×{ed.activeArtboard.h}</span>
      <span style={{ flex: 1 }} data-testid="status-message">{ed.status}</span>
      <span>{ed.selection.length ? `${ed.selection.length} selected` : ''}</span>
      <span>{ed.history.undoLabel ? `Undo: ${ed.history.undoLabel}` : ''}</span>
    </div>
  );
}

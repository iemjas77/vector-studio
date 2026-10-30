import type { ToolId } from '../editor/types';
import { ToolIcon } from './icons';
import { useApp } from './hooks';

const TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'select', label: 'Selection', key: 'V' },
  { id: 'direct', label: 'Direct Selection', key: 'A' },
  { id: 'rect', label: 'Rectangle', key: 'M' },
  { id: 'ellipse', label: 'Ellipse', key: 'L' },
  { id: 'pen', label: 'Pen', key: 'P' },
  { id: 'hand', label: 'Hand', key: 'H' },
  { id: 'zoom', label: 'Zoom', key: 'Z' },
];

export function Toolbar() {
  const { ed } = useApp();
  return (
    <div className="flex flex-col items-center gap-1 py-2 bg-panel border-r border-edge" style={{ width: 40 }} data-testid="toolbar" role="toolbar" aria-orientation="vertical">
      {TOOLS.map((t) => (
        <button
          key={t.id} className="icon-btn" style={{ width: 32, height: 32 }} aria-pressed={ed.toolId === t.id} aria-label={t.label}
          title={`${t.label} (${t.key})`} data-testid={`tool-${t.id}`} onClick={() => ed.setTool(t.id)}
        ><ToolIcon id={t.id} /></button>
      ))}
    </div>
  );
}

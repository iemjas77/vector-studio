import { useState } from 'react';
import type { ToolId } from '../editor/types';
import { ToolIcon } from './icons';
import { useApp } from './hooks';

interface ToolInfo { id: ToolId; label: string; key: string }
const T = (id: ToolId, label: string, key = ''): ToolInfo => ({ id, label, key });

/** Tools are grouped; each group shows its last-used tool and opens a flyout with the rest (click the corner arrow, or right-click). */
export const TOOL_GROUPS: { id: string; tools: ToolInfo[] }[] = [
  { id: 'select', tools: [T('select', 'Selection', 'V'), T('direct', 'Direct Selection', 'A'), T('wand', 'Magic Wand', 'Y'), T('lasso', 'Lasso', 'Q')] },
  { id: 'pen', tools: [T('pen', 'Pen', 'P'), T('pencil', 'Pencil', 'N')] },
  { id: 'type', tools: [T('text', 'Type', 'T')] },
  { id: 'shape', tools: [T('rect', 'Rectangle', 'M'), T('rrect', 'Rounded Rectangle'), T('ellipse', 'Ellipse', 'L'), T('polygon', 'Polygon'), T('star', 'Star'), T('line', 'Line Segment', '\\'), T('arc', 'Arc'), T('spiral', 'Spiral')] },
  { id: 'paint', tools: [T('eyedropper', 'Eyedropper', 'I'), T('gradient', 'Gradient', 'G')] },
  { id: 'nav', tools: [T('artboard', 'Artboard', 'Shift+O'), T('hand', 'Hand', 'H'), T('zoom', 'Zoom', 'Z')] },
];

const LS = 'vs.toolbar.v1';
function loadPrefs(): { last: Record<string, ToolId>; cols: 1 | 2 } {
  try { const p = JSON.parse(localStorage.getItem(LS) ?? '{}'); return { last: p.last ?? {}, cols: p.cols === 2 ? 2 : 1 }; } catch { return { last: {}, cols: 1 }; }
}

export function Toolbar() {
  const { ed } = useApp();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [open, setOpen] = useState<string | null>(null);
  const save = (p: typeof prefs) => { setPrefs(p); try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* ignore */ } };
  const pick = (group: string, id: ToolId) => { save({ ...prefs, last: { ...prefs.last, [group]: id } }); ed.setTool(id); setOpen(null); };

  return (
    <div className="flex flex-wrap content-start justify-center gap-1 py-2 bg-panel border-r border-edge" style={{ width: prefs.cols === 2 ? 76 : 40, position: 'relative' }} data-testid="toolbar" role="toolbar" aria-orientation="vertical">
      <button className="icon-btn" style={{ width: prefs.cols === 2 ? 68 : 32, height: 16, fontSize: 10 }} data-testid="toolbar-toggle" aria-label={prefs.cols === 2 ? 'Compact toolbar' : 'Expanded toolbar'} onClick={() => save({ ...prefs, cols: prefs.cols === 2 ? 1 : 2 })}>{prefs.cols === 2 ? '◂◂' : '▸▸'}</button>
      {TOOL_GROUPS.map((g) => {
        const active = g.tools.find((t) => t.id === ed.toolId);
        const shown = active ?? g.tools.find((t) => t.id === prefs.last[g.id]) ?? g.tools[0];
        return (
          <div key={g.id} style={{ position: 'relative' }}>
            <button
              className="icon-btn" style={{ width: 32, height: 32 }} aria-pressed={!!active} aria-label={shown.label}
              title={`${shown.label}${shown.key ? ` (${shown.key})` : ''}`} data-testid={`tool-${shown.id}`} onClick={() => pick(g.id, shown.id)}
              onContextMenu={(e) => { e.preventDefault(); if (g.tools.length > 1) setOpen(open === g.id ? null : g.id); }}
            ><ToolIcon id={shown.id} /></button>
            {g.tools.length > 1 && (
              <button aria-label={`${g.id} tools`} data-testid={`flyout-${g.id}`} onClick={() => setOpen(open === g.id ? null : g.id)}
                style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, background: 'transparent', border: 0, color: '#9a9a9a', fontSize: 8, cursor: 'pointer', lineHeight: '10px' }}>◢</button>
            )}
            {open === g.id && (
              <div className="menu-pop" style={{ left: 36, top: 0, minWidth: 200 }} role="menu" data-testid={`flyout-menu-${g.id}`}>
                {g.tools.map((t) => (
                  <button key={t.id} className="menu-item" role="menuitem" data-testid={`tool-${t.id}`} onClick={() => pick(g.id, t.id)}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><ToolIcon id={t.id} />{t.label}</span><span className="text-mute">{t.key}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

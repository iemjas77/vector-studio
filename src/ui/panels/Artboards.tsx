import { useState } from 'react';
import { NumField } from '../controls';
import { useApp } from '../hooks';

export const ARTBOARD_PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'T-shirt print (4500×5400)', w: 4500, h: 5400 },
  { label: 'Square 3000×3000', w: 3000, h: 3000 },
  { label: 'Web HD 1920×1080', w: 1920, h: 1080 },
  { label: 'A4 portrait (794×1123)', w: 794, h: 1123 },
  { label: 'Letter portrait (816×1056)', w: 816, h: 1056 },
  { label: 'Icon 512×512', w: 512, h: 512 },
];

export function ArtboardsPanel() {
  const { ed } = useApp();
  const [preset, setPreset] = useState(0);
  const a = ed.activeArtboard;
  return (
    <div className="flex flex-col gap-2" data-testid="artboards-panel">
      <div className="border border-edge" style={{ maxHeight: 120, overflow: 'auto' }}>
        {ed.doc.artboards.map((ab, i) => (
          <div key={ab.id} className={`layer-row ${ab.id === a.id ? 'sel' : ''}`} data-testid={`artboard-row-${i}`}
            onClick={() => { ed.activeArtboardId = ab.id; ed.emit(); }} onDoubleClick={() => { ed.activeArtboardId = ab.id; ed.fitArtboard(); }}>
            <span className="text-mute" style={{ width: 16 }}>{i + 1}</span>
            <span style={{ flex: 1 }}>{ab.name}</span>
            <span className="text-mute">{ab.w}×{ab.h}</span>
          </div>
        ))}
      </div>
      <div className="row">
        <select data-testid="artboard-preset" value={preset} onChange={(e) => setPreset(+e.target.value)} style={{ flex: 1 }}>
          {ARTBOARD_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
        </select>
        <button className="btn" data-testid="artboard-add" onClick={() => { const p = ARTBOARD_PRESETS[preset]; ed.addArtboard(`Artboard ${ed.doc.artboards.length + 1}`, p.w, p.h); ed.fitArtboard(); }}>Add</button>
      </div>
      <div className="row"><span className="text-mute" style={{ width: 36 }}>Name</span>
        <input type="text" data-testid="artboard-name" style={{ flex: 1 }} value={a.name} onChange={(e) => ed.patchArtboard(a.id, { name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="grid grid-cols-2 gap-1">
        <NumField testId="artboard-x" label="X" value={a.x} onCommit={(v) => ed.patchArtboard(a.id, { x: v })} />
        <NumField testId="artboard-y" label="Y" value={a.y} onCommit={(v) => ed.patchArtboard(a.id, { y: v })} />
        <NumField testId="artboard-w" label="W" value={a.w} min={1} max={16384} onCommit={(v) => ed.patchArtboard(a.id, { w: v })} />
        <NumField testId="artboard-h" label="H" value={a.h} min={1} max={16384} onCommit={(v) => ed.patchArtboard(a.id, { h: v })} />
      </div>
      <div className="row">
        <label className="row"><input type="checkbox" data-testid="artboard-transparent" checked={a.background === null} onChange={(e) => ed.patchArtboard(a.id, { background: e.target.checked ? null : '#ffffff' })} /> Transparent</label>
        {a.background !== null && <input type="color" data-testid="artboard-bg" value={a.background} onChange={(e) => ed.patchArtboard(a.id, { background: e.target.value })} style={{ width: 32, height: 22, padding: 0 }} />}
        <span style={{ flex: 1 }} />
        <button className="btn" data-testid="artboard-delete" disabled={ed.doc.artboards.length < 2} onClick={() => ed.removeArtboard(a.id)}>Delete</button>
      </div>
    </div>
  );
}

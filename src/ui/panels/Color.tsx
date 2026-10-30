import { solid } from '../../core/document';
import { useApp } from '../hooks';
import { useUi } from '../store';
import { NumField } from '../controls';
import { useEffect, useState } from 'react';

const SWATCHES = [
  '#000000', '#434343', '#7f7f7f', '#bfbfbf', '#ffffff', '#ff0000', '#ff7f00', '#ffd400', '#7ed321', '#00a651', '#00b5b0', '#0070ff',
  '#2a2ad4', '#7a2ad4', '#e5007e', '#8b5a2b', '#f5d6b3', '#ffb3b3', '#fff2a8', '#b8e0ff', '#c9b3ff', '#003049', '#d62828', '#f77f00',
];

const HEX = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
export function normalizeHex(s: string): string | null {
  const m = HEX.exec(s.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return '#' + h;
}

export function ColorPanel() {
  const { ed } = useApp();
  const target = useUi((s) => s.colorTarget);
  const setTarget = useUi((s) => s.setColorTarget);
  const fill = ed.currentFill, stroke = ed.currentStroke;
  const paint = target === 'fill' ? fill : stroke?.paint ?? null;
  const [hex, setHex] = useState(paint?.color ?? '');
  useEffect(() => setHex(paint?.color ?? ''), [paint?.color]);

  const apply = (color: string | null, alpha?: number) => {
    if (color === null) {
      if (target === 'fill') ed.setFill(null); else ed.updateStroke(null);
      return;
    }
    const a = alpha ?? paint?.alpha ?? 1;
    if (target === 'fill') ed.setFill(solid(color, a));
    else ed.updateStroke({ paint: solid(color, a) });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="color-panel">
      <div className="row">
        <div style={{ position: 'relative', width: 46, height: 40 }}>
          <button
            aria-label="Fill" aria-pressed={target === 'fill'} data-testid="target-fill" onClick={() => setTarget('fill')}
            className={fill ? '' : 'checker'}
            style={{ position: 'absolute', left: 0, top: 0, width: 26, height: 26, border: target === 'fill' ? '2px solid #4d9cff' : '1px solid #777', background: fill?.color, zIndex: target === 'fill' ? 2 : 1, opacity: fill ? fill.alpha : 1 }}
          />
          <button
            aria-label="Stroke" aria-pressed={target === 'stroke'} data-testid="target-stroke" onClick={() => setTarget('stroke')}
            style={{ position: 'absolute', left: 14, top: 12, width: 26, height: 26, border: `5px solid ${stroke?.paint.color ?? 'transparent'}`, background: '#2a2a2a', outline: target === 'stroke' ? '2px solid #4d9cff' : '1px solid #777', zIndex: target === 'stroke' ? 2 : 1 }}
          >{!stroke && <span style={{ color: '#f66' }}>⁄</span>}</button>
        </div>
        <button className="btn" data-testid="color-none" onClick={() => apply(null)} title="No fill / no stroke">None</button>
        <button className="btn" data-testid="color-swap" onClick={() => ed.swapFillStroke()} title="Swap fill and stroke (Shift+X)">⇄</button>
      </div>
      <div className="row">
        <input type="color" data-testid="color-picker" aria-label="Colour picker" value={paint?.color ?? '#000000'} onChange={(e) => apply(e.target.value)} style={{ width: 32, height: 24, padding: 0 }} />
        <input
          type="text" data-testid="color-hex" aria-label="Hex colour" style={{ width: 78 }} value={hex}
          onChange={(e) => setHex(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { const n = normalizeHex(hex); if (n) apply(n); else setHex(paint?.color ?? ''); } }}
          onBlur={() => { const n = normalizeHex(hex); if (n && n !== paint?.color) apply(n); else setHex(paint?.color ?? ''); }}
        />
        <NumField testId="color-alpha" label="α" value={paint ? paint.alpha * 100 : null} min={0} max={100} decimals={0} width={44} unit="%" disabled={!paint} onCommit={(v) => paint && apply(paint.color, v / 100)} />
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }} data-testid="swatches">
        {SWATCHES.map((c) => (
          <button key={c} aria-label={`Swatch ${c}`} title={c} data-testid={`swatch-${c.slice(1)}`} onClick={() => apply(c)}
            style={{ height: 18, background: c, border: '1px solid #555', cursor: 'pointer' }} />
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';

/** Numeric input that commits on Enter/blur and reverts on Esc or invalid text. */
export function NumField({ value, onCommit, min, max, step = 1, width = 64, unit, disabled, label, decimals = 2, testId }: {
  value: number | null; onCommit(v: number): void; min?: number; max?: number; step?: number; width?: number; unit?: string;
  disabled?: boolean; label?: string; decimals?: number; testId?: string;
}) {
  const fmt = (v: number | null) => (v === null || !isFinite(v) ? '' : String(Math.round(v * 10 ** decimals) / 10 ** decimals));
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(fmt(value)); }, [value, focused]);
  const commit = () => {
    const v = parseFloat(text.replace(',', '.'));
    if (!isFinite(v)) { setText(fmt(value)); return; }
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (value === null || Math.abs(c - value) > 1e-9) onCommit(c);
    setText(fmt(c));
  };
  return (
    <span className="row" style={{ gap: 3 }}>
      {label && <span className="lbl">{label}</span>}
      <input
        type="text" inputMode="decimal" data-testid={testId} aria-label={label ?? testId}
        style={{ width }} disabled={disabled} value={text}
        onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { commit(); e.currentTarget.blur(); }
          else if (e.key === 'Escape') { setText(fmt(value)); e.currentTarget.blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const cur = parseFloat(text) || 0;
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, cur + d));
            setText(fmt(c)); onCommit(c);
          }
        }}
      />
      {unit && <span className="text-mute">{unit}</span>}
    </span>
  );
}

export function Section({ id, title, collapsed, onToggle, children }: { id: string; title: string; collapsed: boolean; onToggle(): void; children: ReactNode }) {
  return (
    <section data-testid={`panel-${id}`} className="border-b border-edge">
      <div className="panel-head" onClick={onToggle} role="button" aria-expanded={!collapsed}>
        <span style={{ width: 10 }}>{collapsed ? '▸' : '▾'}</span>{title}
      </div>
      {!collapsed && <div className="p-2">{children}</div>}
    </section>
  );
}

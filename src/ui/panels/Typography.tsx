import { useEffect, useRef } from 'react';
import { NumField } from '../controls';
import { useApp } from '../hooks';
import { fonts } from '../../core/text';
import type { TextAlign } from '../../core/document';

const WEIGHTS: [number, string][] = [[100, 'Thin'], [300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'], [900, 'Black']];
const ALIGNS: { a: TextAlign; glyph: string; label: string }[] = [{ a: 'left', glyph: '⯇', label: 'Align left' }, { a: 'center', glyph: '≡', label: 'Align centre' }, { a: 'right', glyph: '⯈', label: 'Align right' }];

export function TypographyPanel() {
  const { ed } = useApp();
  const texts = ed.selectedTexts;
  const t = texts[0];
  const area = useRef<HTMLTextAreaElement>(null);

  // Tools ask for the editor to be focused (new text, double-click) – focus and select everything so typing replaces the placeholder.
  useEffect(() => {
    if (ed.textFocusTick > 0 && area.current) { area.current.focus(); area.current.select(); }
  }, [ed.textFocusTick]);

  if (!t) return <div className="text-mute" data-testid="typography-empty">Select a text object, or use the Type tool (T) and click on the artboard.</div>;
  const mixed = texts.length > 1;
  const set = (p: Parameters<typeof ed.setTextProps>[0]) => {
    ed.setTextProps(p);
    // A different family may need loading from the system; re-render when it arrives.
    if (p.fontFamily || p.fontWeight !== undefined || p.italic !== undefined) {
      void fonts.ensure(texts.map((x) => ({ family: p.fontFamily ?? x.fontFamily, weight: p.fontWeight ?? x.fontWeight, italic: p.italic ?? x.italic }))).then((changed) => { if (changed) ed.emit(); });
    }
  };
  return (
    <div className="flex flex-col gap-2" data-testid="typography-panel">
      <textarea
        ref={area} data-testid="text-content" aria-label="Text content" rows={3} value={mixed ? '' : t.content} placeholder={mixed ? '(multiple text objects)' : ''}
        style={{ width: '100%', resize: 'vertical', background: '#1b1b1b', border: '1px solid #3d3d3d', borderRadius: 3, padding: 4, fontFamily: 'system-ui', color: 'inherit', userSelect: 'text' }}
        onFocus={() => ed.beginTextEdit()}
        onChange={(e) => ed.liveTextEdit({ content: e.target.value })}
        onBlur={() => ed.endTextEdit()}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') e.currentTarget.blur(); }}
      />
      <div className="row">
        <input list="font-families" type="text" data-testid="font-family" aria-label="Font family" style={{ flex: 1 }} defaultValue={t.fontFamily} key={t.fontFamily + t.id}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.fontFamily) set({ fontFamily: v }); else e.target.value = t.fontFamily; }} />
        <datalist id="font-families">{fonts.families().map((f) => <option key={f} value={f} />)}</datalist>
      </div>
      <div className="row">
        <select data-testid="font-weight" aria-label="Font weight" value={t.fontWeight} onChange={(e) => set({ fontWeight: +e.target.value })}>
          {WEIGHTS.map(([w, n]) => <option key={w} value={w}>{n}</option>)}
          {!WEIGHTS.some(([w]) => w === t.fontWeight) && <option value={t.fontWeight}>{t.fontWeight}</option>}
        </select>
        <label className="row"><input type="checkbox" data-testid="font-italic" checked={t.italic} onChange={(e) => set({ italic: e.target.checked })} /> Italic</label>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <NumField testId="font-size" label="Sz" value={t.fontSize} min={1} max={2000} step={1} onCommit={(v) => set({ fontSize: v })} />
        <NumField testId="font-lineheight" label="Ld" value={t.lineHeight} min={0.5} max={5} step={0.05} onCommit={(v) => set({ lineHeight: v })} />
        <NumField testId="font-tracking" label="Tr" value={t.tracking} min={-500} max={2000} step={5} decimals={0} onCommit={(v) => set({ tracking: v })} />
        <NumField testId="font-width" label="W" value={t.width} min={0} max={100000} onCommit={(v) => set({ width: v })} />
      </div>
      <div className="row">
        {ALIGNS.map((a) => <button key={a.a} className="btn" style={{ width: 34, background: t.align === a.a ? '#3d5f94' : undefined }} aria-label={a.label} aria-pressed={t.align === a.a} data-testid={`align-text-${a.a}`} onClick={() => set({ align: a.a })}>{a.glyph}</button>)}
        <span className="text-mute" style={{ marginLeft: 6 }}>W = 0: point text</span>
      </div>
      {t.path && <div className="row"><span className="text-mute">Start on path</span><NumField testId="font-pathoffset" value={t.pathOffset * 100} min={-100} max={200} decimals={1} width={56} unit="%" onCommit={(v) => set({ pathOffset: v / 100 })} /></div>}
      <div className="row"><button className="btn" data-testid="create-outlines" onClick={() => ed.convertSelectionToPaths()}>Create outlines</button>
        {texts.length === 1 && ed.selectedElements.some((e) => e.type === 'path') && <button className="btn" data-testid="text-on-path" onClick={() => ed.makeTextOnPath()}>Text on path</button>}
        {t.path && <button className="btn" onClick={() => ed.releaseTextFromPath()}>Release from path</button>}</div>
    </div>
  );
}

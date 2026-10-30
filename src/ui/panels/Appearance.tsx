import { useState } from 'react';
import { BLEND_MODES, solidOf, type BlendMode, type Effect } from '../../core/document';
import { NumField } from '../controls';
import { doStep } from '../commands';
import { useApp } from '../hooks';

const LABEL: Record<string, string> = { blur: 'Gaussian Blur', dropShadow: 'Drop Shadow', outerGlow: 'Outer Glow' };

export function TransparencyPanel() {
  const app = useApp();
  const { ed } = app;
  const first = ed.selectedElements[0];
  const none = !first;
  return (
    <div className="flex flex-col gap-2" data-testid="transparency-panel">
      <div className="row">
        <span className="text-mute" style={{ width: 52 }}>Blend</span>
        <select data-testid="blend-mode" aria-label="Blend mode" disabled={none} value={first?.blend ?? 'normal'} onChange={(e) => doStep(app, 'setBlend', { mode: e.target.value as BlendMode })}>
          {BLEND_MODES.map((m) => <option key={m} value={m}>{m.replace(/-/g, ' ')}</option>)}
        </select>
      </div>
      <div className="row">
        <span className="text-mute" style={{ width: 52 }}>Opacity</span>
        <NumField testId="tp-opacity" value={first ? first.opacity * 100 : null} min={0} max={100} decimals={0} width={52} unit="%" disabled={none} onCommit={(v) => ed.setOpacity(v / 100)} />
      </div>
      <div className="text-mute">Blend modes affect how the object mixes with what is behind it. They show on the artboard and in PNG/JPEG/SVG/PDF exports.</div>
    </div>
  );
}

function EffectRow({ fx, index }: { fx: Effect; index: number }) {
  const { ed } = useApp();
  const set = (patch: Partial<Effect>) => ed.updateEffect(index, { ...fx, ...patch } as Effect);
  return (
    <div className="flex flex-col gap-1" data-testid={`fx-${index}`} style={{ padding: 4, border: '1px solid #3d3d3d', borderRadius: 3 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><b>{LABEL[fx.type]}</b><button className="icon-btn" style={{ width: 18, height: 18 }} aria-label={`Remove ${LABEL[fx.type]}`} data-testid={`fx-remove-${index}`} onClick={() => ed.removeEffect(index)}>×</button></div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {fx.type === 'blur' && <NumField testId={`fx-radius-${index}`} label="Radius" value={fx.radius} min={0} max={1000} width={52} onCommit={(v) => set({ radius: v })} />}
        {fx.type === 'dropShadow' && <>
          <NumField testId={`fx-dx-${index}`} label="X" value={fx.dx} width={44} onCommit={(v) => set({ dx: v })} />
          <NumField testId={`fx-dy-${index}`} label="Y" value={fx.dy} width={44} onCommit={(v) => set({ dy: v })} />
        </>}
        {(fx.type === 'dropShadow' || fx.type === 'outerGlow') && <>
          <NumField testId={`fx-blur-${index}`} label="Blur" value={fx.blur} min={0} max={1000} width={44} onCommit={(v) => set({ blur: v })} />
          <NumField testId={`fx-alpha-${index}`} label="α" value={fx.alpha * 100} min={0} max={100} decimals={0} width={40} unit="%" onCommit={(v) => set({ alpha: v / 100 })} />
          <input type="color" aria-label="Effect colour" data-testid={`fx-color-${index}`} value={fx.color} onChange={(e) => set({ color: e.target.value })} style={{ width: 28, height: 22, padding: 0 }} />
        </>}
      </div>
    </div>
  );
}

export function AppearancePanel() {
  const app = useApp();
  const { ed } = app;
  const first = ed.selectedElements[0];
  const [kind, setKind] = useState<'dropShadow' | 'outerGlow' | 'blur'>('dropShadow');
  if (!first) return <div className="text-mute" data-testid="appearance-empty">Select an object to see its fill, stroke, opacity and live effects.</div>;
  const shape = first.type !== 'group' ? first : null;
  const add = () => doStep(app, 'addEffect', { effect: kind === 'blur' ? { type: 'blur', radius: 4 } : kind === 'dropShadow' ? { type: 'dropShadow', dx: 6, dy: 6, blur: 8, color: '#000000', alpha: 0.5 } : { type: 'outerGlow', blur: 12, color: '#ffd400', alpha: 0.8 } });
  const swatch = (c: string | null, a = 1) => <span style={{ display: 'inline-block', width: 14, height: 14, border: '1px solid #777', background: c ?? 'transparent', opacity: a, verticalAlign: 'middle' }} />;
  return (
    <div className="flex flex-col gap-2" data-testid="appearance-panel">
      <div><b>{first.name}</b> <span className="text-mute">({first.type})</span></div>
      {shape && <>
        <div data-testid="ap-stroke">Stroke {shape.stroke ? <>{swatch(shape.stroke.paint.color, shape.stroke.paint.alpha)} {shape.stroke.width}px</> : <span className="text-mute">none</span>}</div>
        <div data-testid="ap-fill">Fill {shape.fill ? <>{swatch(solidOf(shape.fill).color, solidOf(shape.fill).alpha)} {shape.fill.type === 'solid' ? shape.fill.color : `${shape.fill.type} gradient`}</> : <span className="text-mute">none</span>}</div>
      </>}
      <div data-testid="ap-opacity">Opacity {Math.round(first.opacity * 100)}% · blend {first.blend ?? 'normal'}</div>
      <div className="text-mute">Live effects (editable any time)</div>
      {(first.effects ?? []).map((fx, i) => <EffectRow key={i} fx={fx} index={i} />)}
      {(first.effects ?? []).length === 0 && <div className="text-mute" data-testid="ap-no-effects">No effects</div>}
      <div className="row">
        <select data-testid="fx-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={{ flex: 1 }}>
          <option value="dropShadow">Drop Shadow</option><option value="outerGlow">Outer Glow</option><option value="blur">Gaussian Blur</option>
        </select>
        <button className="btn" data-testid="fx-add" onClick={add}>Add effect</button>
        <button className="btn" data-testid="fx-clear" disabled={!(first.effects ?? []).length} onClick={() => doStep(app, 'clearEffects')}>Clear</button>
      </div>
      <div className="text-mute">PDF cannot hold live effects (a warning is shown when exporting). Multiple fills/strokes are not available yet.</div>
    </div>
  );
}

import { defaultStops, gradientAngle, linearGradient, solidOf, sortStops, type GradientPaint, type GradientStop, type Paint } from '../../core/document';
import { NumField } from '../controls';

export function cssGradient(p: GradientPaint): string {
  const stops = sortStops(p.stops).map((s) => `${hexA(s.color, s.alpha)} ${(s.offset * 100).toFixed(1)}%`).join(', ');
  return `linear-gradient(90deg, ${stops})`;
}
const hexA = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** Result of switching a fill between solid / linear / radial while keeping colours where possible. */
export function convertPaintType(cur: Paint | null, type: 'solid' | 'linear' | 'radial'): Paint {
  const base = cur ? solidOf(cur) : { type: 'solid' as const, color: '#000000', alpha: 1 };
  if (type === 'solid') return base;
  const stops: GradientStop[] = cur && cur.type !== 'solid' ? cur.stops : defaultStops(base.color, '#ffffff');
  if (type === 'linear') return cur?.type === 'linear' ? cur : linearGradient(stops, 0);
  return cur?.type === 'radial' ? cur : { type: 'radial', stops, cx: 0.5, cy: 0.5, r: 0.5 };
}

export function GradientEditor({ paint, onChange }: { paint: GradientPaint; onChange(p: GradientPaint): void }) {
  const stops = paint.stops;
  const set = (next: GradientStop[]) => onChange({ ...paint, stops: next });
  const update = (i: number, patch: Partial<GradientStop>) => set(stops.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div className="flex flex-col gap-2" data-testid="gradient-editor">
      <div data-testid="gradient-preview" style={{ height: 14, border: '1px solid #555', backgroundImage: `${cssGradient(paint)}, linear-gradient(45deg,#777 25%,#bbb 25%,#bbb 50%,#777 50%,#777 75%,#bbb 75%)`, backgroundSize: '100% 100%, 8px 8px' }} />
      {stops.map((s, i) => (
        <div key={i} className="row" data-testid={`stop-${i}`}>
          <input type="color" aria-label={`Stop ${i + 1} colour`} data-testid={`stop-color-${i}`} value={s.color} onChange={(e) => update(i, { color: e.target.value })} style={{ width: 28, height: 22, padding: 0 }} />
          <NumField testId={`stop-offset-${i}`} value={s.offset * 100} min={0} max={100} decimals={0} width={42} unit="%" onCommit={(v) => update(i, { offset: v / 100 })} />
          <NumField testId={`stop-alpha-${i}`} label="α" value={s.alpha * 100} min={0} max={100} decimals={0} width={40} unit="%" onCommit={(v) => update(i, { alpha: v / 100 })} />
          <button className="btn" aria-label={`Remove stop ${i + 1}`} data-testid={`stop-remove-${i}`} disabled={stops.length <= 2} onClick={() => set(stops.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      <div className="row">
        <button className="btn" data-testid="stop-add" onClick={() => {
          const sorted = sortStops(stops);
          let gi = 0, gap = -1;
          for (let k = 0; k < sorted.length - 1; k++) if (sorted[k + 1].offset - sorted[k].offset > gap) { gap = sorted[k + 1].offset - sorted[k].offset; gi = k; }
          set([...sorted, { ...sorted[gi], offset: (sorted[gi].offset + sorted[gi + 1].offset) / 2 }]);
        }}>Add stop</button>
        <button className="btn" data-testid="gradient-reverse" onClick={() => set(stops.map((s) => ({ ...s, offset: 1 - s.offset })))}>Reverse</button>
        {paint.type === 'linear' && <NumField testId="gradient-angle" label="∠" value={gradientAngle(paint)} decimals={1} width={52} unit="°" onCommit={(v) => onChange({ ...linearGradient(stops, v) })} />}
      </div>
    </div>
  );
}

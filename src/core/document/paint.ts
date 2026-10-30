import type { GradientPaint, GradientStop, LinearGradientPaint, Paint, SolidPaint } from './types';

export const isGradient = (p: Paint | null): p is GradientPaint => !!p && p.type !== 'solid';

/** A solid stand-in for any paint (first stop for gradients); used where only flat colour is possible. */
export function solidOf(p: Paint): SolidPaint {
  return p.type === 'solid' ? p : { type: 'solid', color: p.stops[0]?.color ?? '#000000', alpha: p.stops[0]?.alpha ?? 1 };
}

export const paintVisible = (p: Paint | null): boolean =>
  !!p && (p.type === 'solid' ? p.alpha > 0 : p.stops.some((s) => s.alpha > 0));

export function sortStops(stops: readonly GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.offset - b.offset);
}

/** Linear gradient across the whole bounding box at `angleDeg` (0 = left→right, 90 = top→bottom). */
export function linearGradient(stops: GradientStop[], angleDeg = 0): LinearGradientPaint {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const half = (Math.abs(dx) + Math.abs(dy)) / 2; // reaches the corners so the box is fully covered
  return { type: 'linear', stops, x1: 0.5 - dx * half, y1: 0.5 - dy * half, x2: 0.5 + dx * half, y2: 0.5 + dy * half };
}

export function gradientAngle(g: LinearGradientPaint): number {
  return (Math.atan2(g.y2 - g.y1, g.x2 - g.x1) * 180) / Math.PI;
}

export function radialGradient(stops: GradientStop[]): Paint {
  return { type: 'radial', stops, cx: 0.5, cy: 0.5, r: 0.5 };
}

export const defaultStops = (a: string, b: string): GradientStop[] => [
  { offset: 0, color: a, alpha: 1 },
  { offset: 1, color: b, alpha: 1 },
];

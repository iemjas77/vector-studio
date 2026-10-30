import { elementBounds, type VDocument } from '../core/document';
import type { Rect, Vec } from '../core/geometry/types';

export interface SnapTargets {
  xs: number[];
  ys: number[];
}

const MAX_OBJECTS = 3000; // keeps snapping O(small) on huge documents

/** Lines objects can snap to: guides, artboard edges/centres, and edges/centres of other visible top-level objects. */
export function collectTargets(doc: VDocument, exclude: ReadonlySet<string>): SnapTargets {
  const xs: number[] = [], ys: number[] = [];
  for (const g of doc.guides ?? []) (g.axis === 'v' ? xs : ys).push(g.pos);
  for (const a of doc.artboards) {
    xs.push(a.x, a.x + a.w / 2, a.x + a.w);
    ys.push(a.y, a.y + a.h / 2, a.y + a.h);
  }
  let n = 0;
  for (const l of doc.layers) {
    if (!l.visible) continue;
    for (const el of l.children) {
      if (!el.visible || exclude.has(el.id)) continue;
      if (++n > MAX_OBJECTS) return { xs, ys };
      const b = elementBounds(el);
      if (!b) continue;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
  }
  return { xs, ys };
}

/** Smallest adjustment that lines one of `values` up with one of `targets` within `thr`; null if none. */
export function snapAxis(values: readonly number[], targets: readonly number[], thr: number): { delta: number; line: number } | null {
  let best: { delta: number; line: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line: t };
    }
  }
  return best;
}

export interface SnapResult<T> {
  value: T;
  lineX: number | null;
  lineY: number | null;
}

export function snapPointTo(p: Vec, t: SnapTargets, thr: number): SnapResult<Vec> {
  const sx = snapAxis([p.x], t.xs, thr), sy = snapAxis([p.y], t.ys, thr);
  return { value: { x: p.x + (sx?.delta ?? 0), y: p.y + (sy?.delta ?? 0) }, lineX: sx?.line ?? null, lineY: sy?.line ?? null };
}

/** Snap a moving box (left/centre/right, top/middle/bottom) by adjusting the drag delta. */
export function snapBoxMove(b: Rect, dx: number, dy: number, t: SnapTargets, thr: number, lockX = false, lockY = false): SnapResult<{ dx: number; dy: number }> {
  const sx = lockX ? null : snapAxis([b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx], t.xs, thr);
  const sy = lockY ? null : snapAxis([b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy], t.ys, thr);
  return { value: { dx: dx + (sx?.delta ?? 0), dy: dy + (sy?.delta ?? 0) }, lineX: sx?.line ?? null, lineY: sy?.line ?? null };
}

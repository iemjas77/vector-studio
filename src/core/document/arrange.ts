import { translate } from '../geometry/matrix';
import type { Rect } from '../geometry/types';
import { createGroup } from './factory';
import { transformWorld } from './ops';
import { locate, worldBounds } from './query';
import type { Element, VDocument } from './types';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeMode = 'hcenters' | 'vcenters' | 'hspace' | 'vspace';

/** Align objects to each other (`to` omitted) or to a reference rect such as an artboard. */
export function alignElements(doc: VDocument, ids: readonly string[], mode: AlignMode, to?: Rect): void {
  const items = ids.map((id) => ({ id, b: worldBounds(doc, id) })).filter((x): x is { id: string; b: Rect } => !!x.b);
  if (items.length === 0 || (!to && items.length < 2)) return;
  const ref = to ?? {
    x: Math.min(...items.map((i) => i.b.x)), y: Math.min(...items.map((i) => i.b.y)),
    w: Math.max(...items.map((i) => i.b.x + i.b.w)) - Math.min(...items.map((i) => i.b.x)),
    h: Math.max(...items.map((i) => i.b.y + i.b.h)) - Math.min(...items.map((i) => i.b.y)),
  };
  for (const { id, b } of items) {
    let dx = 0, dy = 0;
    if (mode === 'left') dx = ref.x - b.x;
    else if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w);
    else if (mode === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    else if (mode === 'top') dy = ref.y - b.y;
    else if (mode === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
    else dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    if (dx || dy) transformWorld(doc, [id], translate(dx, dy));
  }
}

/** Distribute centres evenly, or make the gaps between objects equal. Needs ≥3 objects; the two extremes stay put. */
export function distributeElements(doc: VDocument, ids: readonly string[], mode: DistributeMode): void {
  const horiz = mode === 'hcenters' || mode === 'hspace';
  const items = ids.map((id) => ({ id, b: worldBounds(doc, id) })).filter((x): x is { id: string; b: Rect } => !!x.b);
  if (items.length < 3) return;
  const lo = (b: Rect) => (horiz ? b.x : b.y), len = (b: Rect) => (horiz ? b.w : b.h);
  items.sort((a, b) => lo(a.b) + len(a.b) / 2 - (lo(b.b) + len(b.b) / 2));
  const first = items[0].b, last = items[items.length - 1].b;
  if (mode === 'hcenters' || mode === 'vcenters') {
    const c0 = lo(first) + len(first) / 2, c1 = lo(last) + len(last) / 2;
    items.forEach((it, i) => {
      const target = c0 + ((c1 - c0) * i) / (items.length - 1);
      const d = target - (lo(it.b) + len(it.b) / 2);
      if (d) transformWorld(doc, [it.id], horiz ? translate(d, 0) : translate(0, d));
    });
    return;
  }
  const total = lo(last) + len(last) - lo(first);
  const gap = (total - items.reduce((s, it) => s + len(it.b), 0)) / (items.length - 1);
  let pos = lo(first);
  for (const it of items) {
    const d = pos - lo(it.b);
    if (d) transformWorld(doc, [it.id], horiz ? translate(d, 0) : translate(0, d));
    pos += len(it.b) + gap;
  }
}

/** Make a clipping mask: the top-most selected object becomes the clip path of a new group. */
export function makeClippingMask(doc: VDocument, ids: readonly string[]): string | null {
  const locs = ids.map((id) => locate(doc, id)).filter((l): l is NonNullable<typeof l> => !!l);
  if (locs.length < 2) return null;
  const siblings = locs[0].siblings;
  const same = locs.filter((l) => l.siblings === siblings).sort((a, b) => a.index - b.index);
  if (same.length < 2) return null;
  const clipEl = same[same.length - 1].element;
  if (clipEl.type === 'group') return null; // clip path must be a shape
  const children: Element[] = same.map((l) => l.element);
  const g = createGroup(children, { name: 'Clipping group', clip: true });
  const insertAt = same[same.length - 1].index - same.length + 1;
  for (let i = same.length - 1; i >= 0; i--) siblings.splice(same[i].index, 1);
  siblings.splice(insertAt, 0, g);
  return g.id;
}

/** Release a clipping mask back to ordinary group children (the clip path becomes a normal object). */
export function releaseClippingMask(doc: VDocument, id: string): boolean {
  const loc = locate(doc, id);
  if (!loc || loc.element.type !== 'group' || !loc.element.clip) return false;
  loc.element.clip = false;
  return true;
}

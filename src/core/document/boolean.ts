import paperCore from 'paper/dist/paper-core.js';
import type PaperTypes from 'paper';
import { apply, applyVector, multiply } from '../geometry/matrix';
import type { PathNode } from '../geometry/types';
import { createPath } from './factory';
import { locate, worldMatrix } from './query';
import { elementSubpaths } from './shape';
import type { Element, PathElement, ShapeElement, VDocument } from './types';

export type BooleanOp = 'unite' | 'subtract' | 'intersect' | 'exclude';

// paper-core ships without typings; the full package typings describe the same API.
const paper = paperCore as unknown as typeof PaperTypes;
type PaperScope = InstanceType<typeof PaperTypes.PaperScope>;

let scope: PaperScope | null = null;
function ps(): PaperScope {
  if (!scope) {
    scope = new paper.PaperScope();
    scope.setup(new paper.Size(1, 1));
  }
  return scope;
}

/** Shape → Paper compound path in WORLD space. */
function toPaper(doc: VDocument, el: ShapeElement): paper.PathItem {
  const W = multiply(worldMatrix(doc, el.id), [1, 0, 0, 1, 0, 0]);
  const paths = elementSubpaths(el).filter((s) => s.nodes.length >= 2).map((s) => {
    const segs = s.nodes.map((n) => {
      const p = apply(W, n);
      const i = applyVector(W, { x: n.inX, y: n.inY });
      const o = applyVector(W, { x: n.outX, y: n.outY });
      return new paper.Segment(new paper.Point(p.x, p.y), new paper.Point(i.x, i.y), new paper.Point(o.x, o.y));
    });
    return new paper.Path({ segments: segs, closed: true, insert: false });
  });
  const item = paths.length === 1 ? paths[0] : new paper.CompoundPath({ children: paths, insert: false });
  if (el.type === 'path' && el.fillRule === 'evenodd') (item as paper.CompoundPath).fillRule = 'evenodd';
  return item;
}

function fromPaper(item: paper.PathItem): { nodes: PathNode[]; closed: boolean }[] {
  const paths: paper.Path[] = item instanceof paper.CompoundPath ? (item.children as paper.Path[]) : [item as paper.Path];
  return paths
    .filter((p) => p.segments.length >= 2)
    .map((p) => ({
      closed: p.closed,
      nodes: p.segments.map((s) => ({ x: s.point.x, y: s.point.y, inX: s.handleIn.x, inY: s.handleIn.y, outX: s.handleOut.x, outY: s.handleOut.y })),
    }));
}

function collectShapes(els: Element[], out: ShapeElement[]): void {
  for (const e of els) if (e.type === 'group') collectShapes(e.children, out); else out.push(e);
}

/**
 * Combines the given objects (groups contribute all of their shapes). Result is one compound path
 * in world space with identity transform. Style: `subtract` keeps the back-most object's look, others the front-most.
 * Returns the new element id, or null if the operation is not possible / produces nothing.
 */
export function booleanOperation(doc: VDocument, ids: readonly string[], op: BooleanOp): string | null {
  ps();
  const locs = ids.map((id) => locate(doc, id)).filter((l): l is NonNullable<typeof l> => !!l);
  if (locs.length < 2) return null;
  // z-order: layer order, then index (back → front) using a stable walk of the document.
  const order = new Map<string, number>();
  let n = 0;
  const walk = (list: Element[]) => list.forEach((e) => { order.set(e.id, n++); if (e.type === 'group') walk(e.children); });
  doc.layers.forEach((l) => walk(l.children));
  locs.sort((a, b) => (order.get(a.element.id) ?? 0) - (order.get(b.element.id) ?? 0));

  const operands: { shapes: ShapeElement[] }[] = locs.map((l) => {
    const shapes: ShapeElement[] = [];
    collectShapes([l.element], shapes);
    return { shapes };
  });
  const items = operands.map((o) => {
    const parts = o.shapes.map((s) => toPaper(doc, s));
    return parts.length === 1 ? parts[0] : parts.reduce((a, b) => a.unite(b, { insert: false }));
  });
  let result = items[0];
  for (let i = 1; i < items.length; i++) {
    const other = items[i];
    result = op === 'unite' ? result.unite(other, { insert: false })
      : op === 'subtract' ? result.subtract(other, { insert: false })
      : op === 'intersect' ? result.intersect(other, { insert: false })
      : result.exclude(other, { insert: false });
  }
  const subs = fromPaper(result);
  if (subs.length === 0) return null;

  const styleSrc = (op === 'subtract' ? operands[0] : operands[operands.length - 1]).shapes[0];
  const target = locs[locs.length - 1]; // insert where the front-most operand was
  const out: PathElement = createPath(subs[0].nodes, subs[0].closed, {
    name: 'Compound path',
    fill: styleSrc.fill, stroke: styleSrc.stroke, opacity: styleSrc.opacity,
    extra: subs.slice(1), fillRule: (result as paper.CompoundPath).fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
  });
  const at = target.index;
  const siblings = target.siblings;
  for (const l of [...locs].sort((a, b) => b.index - a.index)) if (l.siblings === siblings) siblings.splice(l.index, 1);
  for (const l of locs) if (l.siblings !== siblings) l.siblings.splice(l.siblings.indexOf(l.element), 1);
  const insertAt = Math.max(0, Math.min(at - locs.filter((l) => l.siblings === siblings && l.index < at).length, siblings.length));
  siblings.splice(insertAt, 0, out);
  return out.id;
}

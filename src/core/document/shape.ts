import { current, isDraft } from 'immer';
import { ellipseToNodes, rectToNodes } from '../geometry/path';
import type { PathNode } from '../geometry/types';
import { newId } from './ids';
import type { Element, PathElement, RectElement, EllipseElement } from './types';

/** Bezier nodes for any shape (rect and ellipse are expanded on demand). */
export function elementNodes(el: RectElement | EllipseElement | PathElement): PathNode[] {
  switch (el.type) {
    case 'rect': return rectToNodes(el.x, el.y, el.w, el.h, el.rx);
    case 'ellipse': return ellipseToNodes(el.cx, el.cy, el.rx, el.ry);
    case 'path': return el.nodes;
  }
}

/** Convert a live rect/ellipse into an editable path (same id, appearance and transform). */
export function toPathElement(el: Element): PathElement | null {
  if (el.type === 'group') return null;
  if (el.type === 'path') return el;
  return {
    id: el.id, name: el.name, visible: el.visible, locked: el.locked, opacity: el.opacity, transform: el.transform,
    fill: el.fill, stroke: el.stroke, type: 'path', nodes: elementNodes(el).map((n) => ({ ...n })), closed: true, extra: [], fillRule: 'nonzero',
  };
}

/** Deep clone with fresh ids. */
export function cloneWithNewIds<T extends Element>(el: T): T {
  const copy = structuredClone(isDraft(el) ? (current(el as Element) as T) : el);
  const walk = (e: Element) => { e.id = newId(); if (e.type === 'group') e.children.forEach(walk); };
  walk(copy);
  return copy;
}

/** All subpaths of a shape (rect/ellipse have one closed subpath). */
export function elementSubpaths(el: RectElement | EllipseElement | PathElement): { nodes: PathNode[]; closed: boolean }[] {
  if (el.type === 'path') return [{ nodes: el.nodes, closed: el.closed }, ...el.extra];
  return [{ nodes: elementNodes(el), closed: true }];
}

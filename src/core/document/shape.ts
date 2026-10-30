import { current, isDraft } from 'immer';
import { ellipseToNodes, rectToNodes } from '../geometry/path';
import type { PathNode } from '../geometry/types';
import { newId } from './ids';
import { layoutText } from '../text/layout';
import type { Element, PathElement, ShapeElement } from './types';

/** Bezier nodes for any shape (rect and ellipse are expanded on demand). */
export function elementNodes(el: ShapeElement): PathNode[] {
  switch (el.type) {
    case 'rect': return rectToNodes(el.x, el.y, el.w, el.h, el.rx);
    case 'ellipse': return ellipseToNodes(el.cx, el.cy, el.rx, el.ry);
    case 'path': return el.nodes;
    case 'text': return []; // text is edited as text; convert to outlines to edit anchors
  }
}

/** Convert a live rect/ellipse into an editable path (same id, appearance and transform). */
export function toPathElement(el: Element): PathElement | null {
  if (el.type === 'group') return null;
  if (el.type === 'path') return el;
  if (el.type === 'text') {
    const sp = layoutText(el).subpaths;
    if (sp.length === 0) return null;
    return {
      id: el.id, name: el.content.split('\n')[0].slice(0, 40) || 'Outlined text', visible: el.visible, locked: el.locked, opacity: el.opacity, transform: el.transform,
      fill: el.fill, stroke: el.stroke, type: 'path', nodes: sp[0].nodes, closed: true, extra: sp.slice(1), fillRule: 'nonzero',
    };
  }
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
export function elementSubpaths(el: ShapeElement): { nodes: PathNode[]; closed: boolean }[] {
  if (el.type === 'path') return [{ nodes: el.nodes, closed: el.closed }, ...el.extra];
  if (el.type === 'text') return layoutText(el).subpaths;
  return [{ nodes: elementNodes(el), closed: true }];
}

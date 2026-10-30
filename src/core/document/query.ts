import { apply, boundsOfPoints, invert, multiply, unionRect, IDENTITY } from '../geometry/matrix';
import { elementSubpaths } from './shape';
import { paintVisible } from './paint';
import { layoutText } from '../text/layout';
import { flattenPath, pathBounds, pointInPolygon, nearestOnPath, windingNumber } from '../geometry/path';
import type { Matrix, Rect, Vec } from '../geometry/types';
import type { Element, Layer, ShapeElement, VDocument } from './types';

export interface Location {
  element: Element;
  siblings: Element[];
  index: number;
  /** Layer that contains it. */
  layer: Layer;
  /** Parent group chain (outermost first). */
  parents: Element[];
}

export function locate(doc: VDocument, id: string): Location | null {
  const walk = (list: Element[], layer: Layer, parents: Element[]): Location | null => {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.id === id) return { element: e, siblings: list, index: i, layer, parents };
      if (e.type === 'group') {
        const r = walk(e.children, layer, [...parents, e]);
        if (r) return r;
      }
    }
    return null;
  };
  for (const l of doc.layers) {
    const r = walk(l.children, l, []);
    if (r) return r;
  }
  return null;
}

export function getElement(doc: VDocument, id: string): Element | null {
  return locate(doc, id)?.element ?? null;
}

/** Product of the transforms of all ancestor groups (not including the element itself). */
export function parentMatrix(doc: VDocument, id: string): Matrix {
  const loc = locate(doc, id);
  if (!loc) return IDENTITY;
  return loc.parents.reduce<Matrix>((m, g) => multiply(m, g.transform), IDENTITY);
}

export function worldMatrix(doc: VDocument, id: string): Matrix {
  const loc = locate(doc, id);
  if (!loc) return IDENTITY;
  return multiply(parentMatrix(doc, id), loc.element.transform);
}

/** True if the element, any ancestor group, or its layer is hidden/locked. */
export function isEffectivelyLocked(doc: VDocument, id: string): boolean {
  const loc = locate(doc, id);
  return !loc || loc.layer.locked || loc.parents.some((p) => p.locked) || loc.element.locked;
}
export function isEffectivelyVisible(doc: VDocument, id: string): boolean {
  const loc = locate(doc, id);
  return !!loc && loc.layer.visible && loc.parents.every((p) => p.visible) && loc.element.visible;
}

/** Local-space (untransformed) geometric bounds of a shape. */
export function localBounds(el: ShapeElement): Rect | null {
  switch (el.type) {
    case 'rect': return { x: el.x, y: el.y, w: el.w, h: el.h };
    case 'ellipse': return { x: el.cx - el.rx, y: el.cy - el.ry, w: el.rx * 2, h: el.ry * 2 };
    case 'path': return pathBounds(el.nodes, el.closed);
    case 'text': return layoutText(el).box;
  }
}

/**
 * Exact bounds of an element in its PARENT space (element transform applied).
 * Bezier shapes are measured exactly by transforming the nodes, not the local bbox.
 */
export function elementBounds(el: Element, withStroke = false): Rect | null {
  if (el.type === 'group') {
    let r: Rect | null = null;
    const kids = el.clip && el.children.length > 1 ? [el.children[el.children.length - 1]] : el.children; // clipped content never extends past the mask
    for (const c of kids) {
      const cb = elementBounds(c, withStroke);
      if (cb) r = unionRect(r, transformBounds(el.transform, cb));
    }
    return r;
  }
  const t = el.transform;
  let b: Rect | null = null;
  if (el.type === 'text') {
    const bx = layoutText(el).box;
    b = transformBounds(t, bx);
    return b;
  }
  for (const sp of elementSubpaths(el)) {
    const moved = sp.nodes.map((n) => {
      const p = apply(t, n);
      const a = { x: t[0] * n.inX + t[2] * n.inY, y: t[1] * n.inX + t[3] * n.inY };
      const o = { x: t[0] * n.outX + t[2] * n.outY, y: t[1] * n.outX + t[3] * n.outY };
      return { x: p.x, y: p.y, inX: a.x, inY: a.y, outX: o.x, outY: o.y };
    });
    b = unionRect(b, pathBounds(moved, sp.closed));
  }
  if (!b) return null;
  if (withStroke && el.stroke && el.stroke.width > 0) {
    const sx = Math.hypot(t[0], t[1]);
    const sy = Math.hypot(t[2], t[3]);
    const pad = (el.stroke.width * Math.max(sx, sy)) / 2;
    return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  }
  return b;
}

function transformBounds(m: Matrix, r: Rect): Rect {
  return boundsOfPoints([
    apply(m, { x: r.x, y: r.y }), apply(m, { x: r.x + r.w, y: r.y }),
    apply(m, { x: r.x + r.w, y: r.y + r.h }), apply(m, { x: r.x, y: r.y + r.h }),
  ]);
}

/** Bounds in WORLD (document) space. */
export function worldBounds(doc: VDocument, id: string, withStroke = false): Rect | null {
  const loc = locate(doc, id);
  if (!loc) return null;
  const b = elementBounds(loc.element, withStroke);
  if (!b) return null;
  return transformBounds(parentMatrix(doc, id), b);
}

export function selectionBounds(doc: VDocument, ids: readonly string[]): Rect | null {
  let r: Rect | null = null;
  for (const id of ids) r = unionRect(r, worldBounds(doc, id));
  return r;
}

/** Hit test a single element at a point given in the element's PARENT space. `tol` is in parent units. */
export function hitElement(el: Element, p: Vec, tol: number): boolean {
  if (!el.visible) return false;
  const inv = invert(el.transform);
  if (!inv) return false;
  const lp = apply(inv, p);
  const scale = Math.sqrt(Math.abs(el.transform[0] * el.transform[3] - el.transform[1] * el.transform[2])) || 1;
  const ltol = tol / scale;
  if (el.type === 'group') {
    if (el.clip && el.children.length > 1) {
      const clipEl = el.children[el.children.length - 1];
      if (clipEl.type === 'group' || !hitElement({ ...clipEl, fill: { type: 'solid', color: '#000000', alpha: 1 }, stroke: null }, lp, 0)) return false;
      return el.children.slice(0, -1).some((c) => hitElement(c, lp, ltol));
    }
    return el.children.some((c) => hitElement(c, lp, ltol));
  }
  if (el.type === 'text') {
    const bx = layoutText(el).box;
    return lp.x >= bx.x - ltol && lp.x <= bx.x + bx.w + ltol && lp.y >= bx.y - ltol && lp.y <= bx.y + bx.h + ltol;
  }
  const subs = elementSubpaths(el).filter((s) => s.nodes.length > 0);
  if (subs.length === 0) return false;
  if (paintVisible(el.fill) && el.type === 'path' && el.extra.length > 0) {
    const polys = subs.map((s) => flattenPath(s.nodes, true, 0.1 / scale));
    if (insideCompound(polys, lp, el.fillRule)) return true;
  } else if (paintVisible(el.fill) && subs[0].closed) {
    const nodes = subs[0].nodes;
    if (el.type === 'rect') {
      if (el.rx === 0) {
        if (lp.x >= el.x && lp.x <= el.x + el.w && lp.y >= el.y && lp.y <= el.y + el.h) return true;
      } else if (pointInPolygon(flattenPath(nodes, true, 0.1 / scale), lp)) return true;
    } else if (el.type === 'ellipse') {
      if (el.rx > 0 && el.ry > 0 && ((lp.x - el.cx) / el.rx) ** 2 + ((lp.y - el.cy) / el.ry) ** 2 <= 1) return true;
    } else if (pointInPolygon(flattenPath(nodes, true, 0.1 / scale), lp)) return true;
  }
  const strokeHalf = el.stroke ? el.stroke.width / 2 : 0;
  // Even with no stroke, allow a small tolerance on the outline so thin paths remain pickable.
  const reach = Math.max(strokeHalf, 0) + ltol;
  if (el.stroke || !el.fill) {
    for (const s of subs) {
      const hit = nearestOnPath(s.nodes, s.closed, lp);
      if (hit && hit.dist <= reach) return true;
    }
  }
  return false;
}

/**
 * Topmost element hit at a world point. `deep` selects the innermost shape (isolation / direct selection);
 * otherwise returns the top-level object (a group counts as one object).
 */
export function hitTest(doc: VDocument, world: Vec, tol: number, deep = false): string | null {
  for (let li = doc.layers.length - 1; li >= 0; li--) {
    const layer = doc.layers[li];
    if (!layer.visible || layer.locked) continue;
    const r = hitInList(layer.children, world, tol, deep);
    if (r) return r;
  }
  return null;
}

function hitInList(list: Element[], p: Vec, tol: number, deep: boolean): string | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const el = list[i];
    if (!el.visible || el.locked) continue;
    if (!hitElement(el, p, tol)) continue;
    if (el.type === 'group' && deep) {
      const inv = invert(el.transform);
      if (inv) {
        const scale = Math.sqrt(Math.abs(el.transform[0] * el.transform[3] - el.transform[1] * el.transform[2])) || 1;
        const inner = hitInList(el.children, apply(inv, p), tol / scale, true);
        if (inner) return inner;
      }
    }
    return el.id;
  }
  return null;
}

/** Ids of top-level objects whose bounds intersect the marquee (world space). */
export function elementsInRect(doc: VDocument, r: Rect): string[] {
  const out: string[] = [];
  for (const layer of doc.layers) {
    if (!layer.visible || layer.locked) continue;
    for (const el of layer.children) {
      if (!el.visible || el.locked) continue;
      const b = elementBounds(el);
      if (b && b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y) out.push(el.id);
    }
  }
  return out;
}

export function allElementIds(doc: VDocument): string[] {
  const out: string[] = [];
  const walk = (l: Element[]) => l.forEach((e) => { out.push(e.id); if (e.type === 'group') walk(e.children); });
  doc.layers.forEach((l) => walk(l.children));
  return out;
}

function insideCompound(polys: Vec[][], p: Vec, rule: 'nonzero' | 'evenodd'): boolean {
  let w = 0;
  for (const poly of polys) w += windingNumber(poly, p);
  return rule === 'evenodd' ? w % 2 !== 0 : w !== 0;
}

/** Topmost direct child of a group hit at a world point (used by isolation mode). */
export function hitTestChildren(doc: VDocument, groupId: string, world: Vec, tol: number): string | null {
  const g = getElement(doc, groupId);
  if (!g || g.type !== 'group') return null;
  const full = worldMatrix(doc, groupId);
  const inv = invert(full);
  if (!inv) return null;
  const p = apply(inv, world);
  const scale = Math.sqrt(Math.abs(full[0] * full[3] - full[1] * full[2])) || 1;
  for (let i = g.children.length - 1; i >= 0; i--) {
    const c = g.children[i];
    if (!c.visible || c.locked) continue;
    if (hitElement(c, p, tol / scale)) return c.id;
  }
  return null;
}

/** Direct children of a group whose world bounds intersect the rect. */
export function childrenInRect(doc: VDocument, groupId: string, r: Rect): string[] {
  const g = getElement(doc, groupId);
  if (!g || g.type !== 'group') return [];
  const out: string[] = [];
  for (const c of g.children) {
    if (!c.visible || c.locked) continue;
    const b = worldBounds(doc, c.id);
    if (b && b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y) out.push(c.id);
  }
  return out;
}

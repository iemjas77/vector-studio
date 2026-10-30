import { apply, applyVector, multiply, invert } from '../geometry/matrix';
import type { Matrix, PathNode } from '../geometry/types';
import { newId } from './ids';
import { createArtboard, createGroup, createLayer, createPath } from './factory';
import { locate, parentMatrix, worldMatrix } from './query';
import { cloneWithNewIds, elementSubpaths, toPathElement } from './shape';
import type { Artboard, Element, Layer, Paint, PathElement, ShapeElement, Stroke, VDocument } from './types';

/**
 * Document commands. Every command mutates an immer draft; wrap with History.apply to
 * make it undoable. Commands never touch UI state.
 */

export function addElement(doc: VDocument, el: Element, layerId?: string, index?: number): void {
  const layer = doc.layers.find((l) => l.id === layerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer) throw new Error('Document has no layers');
  if (index === undefined) layer.children.push(el);
  else layer.children.splice(index, 0, el);
}

export function removeElements(doc: VDocument, ids: readonly string[]): void {
  for (const id of ids) {
    const loc = locate(doc, id);
    if (loc) loc.siblings.splice(loc.index, 1);
  }
}

export type ElementPatch = Partial<{
  name: string; visible: boolean; locked: boolean; opacity: number; fill: Paint | null; stroke: Stroke | null;
}>;

export function patchElements(doc: VDocument, ids: readonly string[], patch: ElementPatch): void {
  for (const id of ids) {
    const loc = locate(doc, id);
    if (!loc) continue;
    const el = loc.element;
    if (patch.name !== undefined) el.name = patch.name;
    if (patch.visible !== undefined) el.visible = patch.visible;
    if (patch.locked !== undefined) el.locked = patch.locked;
    if (patch.opacity !== undefined) el.opacity = Math.min(1, Math.max(0, patch.opacity));
    if (el.type !== 'group') {
      if (patch.fill !== undefined) el.fill = patch.fill;
      if (patch.stroke !== undefined) el.stroke = patch.stroke;
    } else if (patch.fill !== undefined || patch.stroke !== undefined) {
      patchElements(doc, el.children.map((c) => c.id), { fill: patch.fill, stroke: patch.stroke });
    }
  }
}

/** Left-multiply a WORLD-space matrix onto elements: each element ends up transformed by `m` in the document. */
export function transformWorld(doc: VDocument, ids: readonly string[], m: Matrix): void {
  for (const id of ids) {
    const loc = locate(doc, id);
    if (!loc) continue;
    const pm = parentMatrix(doc, id);
    const inv = invert(pm);
    if (!inv) continue;
    // local' = P⁻¹ · M · P · local
    const delta = multiply(inv, multiply(m, pm));
    loc.element.transform = multiply(delta, loc.element.transform);
  }
}

export function setTransform(doc: VDocument, id: string, m: Matrix): void {
  const loc = locate(doc, id);
  if (loc) loc.element.transform = m;
}

export function setShapeGeometry(doc: VDocument, id: string, geo: Record<string, number>): void {
  const loc = locate(doc, id);
  if (!loc) return;
  Object.assign(loc.element, geo);
}

/** Replace a path's nodes (converting a rect/ellipse to a path first if needed). */
export function setPathNodes(doc: VDocument, id: string, nodes: PathNode[], closed?: boolean): void {
  const loc = locate(doc, id);
  if (!loc) return;
  let el = loc.element;
  if (el.type === 'rect' || el.type === 'ellipse') {
    const p = toPathElement(el);
    if (!p) return;
    loc.siblings[loc.index] = p;
    el = p;
  }
  if (el.type !== 'path') return;
  el.nodes = nodes;
  if (closed !== undefined) el.closed = closed;
}

export function convertToPath(doc: VDocument, id: string): void {
  const loc = locate(doc, id);
  if (!loc) return;
  const p = toPathElement(loc.element);
  if (p && loc.element.type !== 'path') loc.siblings[loc.index] = p;
}

export type ZOrder = 'front' | 'back' | 'forward' | 'backward';

export function reorder(doc: VDocument, ids: readonly string[], where: ZOrder): void {
  // Process per sibling list to keep relative order of selected items.
  const lists = new Map<Element[], string[]>();
  for (const id of ids) {
    const loc = locate(doc, id);
    if (loc) lists.set(loc.siblings, [...(lists.get(loc.siblings) ?? []), id]);
  }
  for (const [list, sel] of lists) {
    const selected = list.filter((e) => sel.includes(e.id));
    if (where === 'front' || where === 'back') {
      const rest = list.filter((e) => !sel.includes(e.id));
      list.splice(0, list.length, ...(where === 'front' ? [...rest, ...selected] : [...selected, ...rest]));
    } else if (where === 'forward') {
      for (let i = list.length - 2; i >= 0; i--) {
        if (sel.includes(list[i].id) && !sel.includes(list[i + 1].id)) [list[i], list[i + 1]] = [list[i + 1], list[i]];
      }
    } else {
      for (let i = 1; i < list.length; i++) {
        if (sel.includes(list[i].id) && !sel.includes(list[i - 1].id)) [list[i], list[i - 1]] = [list[i - 1], list[i]];
      }
    }
  }
}

/** Move an element to a layer/index (used by layers panel drag & drop). Keeps its world position. */
export function moveElement(doc: VDocument, id: string, layerId: string, index: number): void {
  const loc = locate(doc, id);
  const target = doc.layers.find((l) => l.id === layerId);
  if (!loc || !target) return;
  const world = worldMatrix(doc, id);
  const [el] = loc.siblings.splice(loc.index, 1);
  if (loc.parents.length) el.transform = world; // leaving a group: bake the group transform into the element
  // `index` is expressed in the list as it was before the move; removal shifts later slots down by one.
  const at = loc.siblings === target.children && loc.index < index ? index - 1 : index;
  target.children.splice(Math.max(0, Math.min(at, target.children.length)), 0, el);
}

export function groupElements(doc: VDocument, ids: readonly string[]): string | null {
  const locs = ids.map((id) => locate(doc, id)).filter((l): l is NonNullable<typeof l> => !!l);
  if (locs.length === 0) return null;
  // Only group elements sharing the first one's parent list, preserving z-order.
  const siblings = locs[0].siblings;
  const same = locs.filter((l) => l.siblings === siblings).sort((a, b) => a.index - b.index);
  const group = createGroup(same.map((l) => l.element));
  const insertAt = same[same.length - 1].index - same.length + 1;
  for (let i = same.length - 1; i >= 0; i--) siblings.splice(same[i].index, 1);
  siblings.splice(insertAt, 0, group);
  return group.id;
}

/** Ungroup: children take the group's place with the group transform baked in. */
export function ungroupElements(doc: VDocument, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const loc = locate(doc, id);
    if (!loc || loc.element.type !== 'group') continue;
    const g = loc.element;
    const kids = g.children.map((c) => ({ ...c, transform: multiply(g.transform, c.transform) })) as Element[];
    loc.siblings.splice(loc.index, 1, ...kids);
    out.push(...kids.map((k) => k.id));
  }
  return out;
}

export function duplicateElements(doc: VDocument, ids: readonly string[], dx = 0, dy = 0): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const loc = locate(doc, id);
    if (!loc) continue;
    const copy = cloneWithNewIds(loc.element);
    copy.name = loc.element.name;
    copy.transform = multiply([1, 0, 0, 1, dx, dy], copy.transform);
    loc.siblings.splice(loc.index + 1, 0, copy);
    out.push(copy.id);
  }
  return out;
}

export function insertCopies(doc: VDocument, els: Element[], layerId?: string, dx = 0, dy = 0): string[] {
  const out: string[] = [];
  for (const el of els) {
    const copy = cloneWithNewIds(el);
    copy.transform = multiply([1, 0, 0, 1, dx, dy], copy.transform);
    addElement(doc, copy, layerId);
    out.push(copy.id);
  }
  return out;
}

// ---- layers & artboards ----
export function addLayer(doc: VDocument, name?: string, atIndex?: number): string {
  const layer = createLayer(name ?? `Layer ${doc.layers.length + 1}`);
  doc.layers.splice(atIndex ?? doc.layers.length, 0, layer);
  return layer.id;
}
export function removeLayer(doc: VDocument, id: string): void {
  if (doc.layers.length <= 1) return; // a document always keeps at least one layer
  doc.layers = doc.layers.filter((l) => l.id !== id);
}
export function patchLayer(doc: VDocument, id: string, patch: Partial<Pick<Layer, 'name' | 'visible' | 'locked'>>): void {
  const l = doc.layers.find((x) => x.id === id);
  if (l) Object.assign(l, patch);
}
export function moveLayer(doc: VDocument, id: string, toIndex: number): void {
  const from = doc.layers.findIndex((l) => l.id === id);
  if (from < 0) return;
  const [l] = doc.layers.splice(from, 1);
  doc.layers.splice(Math.max(0, Math.min(toIndex, doc.layers.length)), 0, l);
}

export function addArtboard(doc: VDocument, name: string, w: number, h: number, background: string | null = '#ffffff'): string {
  // Place to the right of the right-most existing artboard with a gap.
  const right = Math.max(...doc.artboards.map((a) => a.x + a.w));
  const top = Math.min(...doc.artboards.map((a) => a.y));
  const a = createArtboard(name, doc.artboards.length ? right + 100 : 0, doc.artboards.length ? top : 0, w, h, background);
  doc.artboards.push(a);
  return a.id;
}
export function patchArtboard(doc: VDocument, id: string, patch: Partial<Omit<Artboard, 'id'>>): void {
  const a = doc.artboards.find((x) => x.id === id);
  if (a) Object.assign(a, patch);
}
export function removeArtboard(doc: VDocument, id: string): void {
  if (doc.artboards.length <= 1) return;
  doc.artboards = doc.artboards.filter((a) => a.id !== id);
}


// ---- compound paths ----

function shapesIn(el: Element, out: ShapeElement[]): void {
  if (el.type === 'group') el.children.forEach((c) => shapesIn(c, out)); else out.push(el);
}

/** Merge the selected objects into one compound path (even-odd, so overlaps become holes). Style from the front-most. */
export function makeCompoundPath(doc: VDocument, ids: readonly string[]): string | null {
  const locs = ids.map((id) => locate(doc, id)).filter((l): l is NonNullable<typeof l> => !!l);
  if (locs.length < 2) return null;
  const order = new Map<string, number>();
  let n = 0;
  const walk = (list: Element[]) => list.forEach((e) => { order.set(e.id, n++); if (e.type === 'group') walk(e.children); });
  doc.layers.forEach((l) => walk(l.children));
  locs.sort((a, b) => (order.get(a.element.id) ?? 0) - (order.get(b.element.id) ?? 0));
  const subs: { nodes: PathNode[]; closed: boolean }[] = [];
  let style: ShapeElement | null = null;
  for (const l of locs) {
    const shapes: ShapeElement[] = [];
    shapesIn(l.element, shapes);
    for (const s of shapes) {
      const W = worldMatrix(doc, s.id);
      for (const sp of elementSubpaths(s)) {
        subs.push({
          closed: sp.closed,
          nodes: sp.nodes.map((nd) => {
            const p = apply(W, nd), i = applyVector(W, { x: nd.inX, y: nd.inY }), o = applyVector(W, { x: nd.outX, y: nd.outY });
            return { x: p.x, y: p.y, inX: i.x, inY: i.y, outX: o.x, outY: o.y };
          }),
        });
      }
      style = s;
    }
  }
  if (!style || subs.length < 2) return null;
  const st = style as ShapeElement;
  const out = createPath(subs[0].nodes, subs[0].closed, { name: 'Compound path', fill: st.fill, stroke: st.stroke, opacity: st.opacity, extra: subs.slice(1), fillRule: 'evenodd' });
  const target = locs[locs.length - 1];
  const siblings = target.siblings;
  const insertAt = target.index - locs.filter((l) => l.siblings === siblings && l.index < target.index).length;
  for (const l of locs) l.siblings.splice(l.siblings.indexOf(l.element), 1);
  siblings.splice(Math.max(0, insertAt), 0, out);
  return out.id;
}

/** Split compound paths back into separate paths (same look and transform). Returns the new ids. */
export function releaseCompoundPaths(doc: VDocument, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const loc = locate(doc, id);
    if (!loc || loc.element.type !== 'path' || loc.element.extra.length === 0) continue;
    const p = loc.element as PathElement;
    const parts = [{ nodes: p.nodes, closed: p.closed }, ...p.extra].map((s, i) =>
      createPath(s.nodes.map((nd) => ({ ...nd })), s.closed, { name: `${p.name} ${i + 1}`, fill: p.fill, stroke: p.stroke, opacity: p.opacity, transform: [...p.transform] as Matrix }));
    loc.siblings.splice(loc.index, 1, ...parts);
    out.push(...parts.map((x) => x.id));
  }
  return out;
}

// ---- guides ----
export function addGuide(doc: VDocument, axis: 'v' | 'h', pos: number, id?: string): string {
  const g = { id: id ?? newId(), axis, pos };
  (doc.guides ??= []).push(g);
  return g.id;
}
export function moveGuide(doc: VDocument, id: string, pos: number): void {
  const g = doc.guides?.find((x) => x.id === id);
  if (g) g.pos = pos;
}
export function removeGuide(doc: VDocument, id: string): void {
  if (doc.guides) doc.guides = doc.guides.filter((g) => g.id !== id);
}
export function clearGuides(doc: VDocument): void {
  if (doc.guides?.length) doc.guides = [];
}

import { IDENTITY } from '../geometry/matrix';
import type { PathNode } from '../geometry/types';
import { newId } from './ids';
import {
  FORMAT_NAME, FORMAT_VERSION,
  type Artboard, type EllipseElement, type GroupElement, type Layer, type Paint, type PathElement,
  type RectElement, type Stroke, type VDocument, type Element,
} from './types';

export const solid = (color: string, alpha = 1): Paint => ({ type: 'solid', color, alpha });

export const defaultStroke = (color = '#000000', width = 1): Stroke => ({
  paint: solid(color), width, cap: 'butt', join: 'miter', miterLimit: 4, dash: [],
});

const base = (name: string) => ({
  id: newId(), name, visible: true, locked: false, opacity: 1, transform: [...IDENTITY] as typeof IDENTITY,
});

export function createRect(x: number, y: number, w: number, h: number, init: Partial<RectElement> = {}): RectElement {
  return { ...base('Rectangle'), type: 'rect', x, y, w, h, rx: 0, fill: solid('#d9d9d9'), stroke: null, ...init };
}
export function createEllipse(cx: number, cy: number, rx: number, ry: number, init: Partial<EllipseElement> = {}): EllipseElement {
  return { ...base('Ellipse'), type: 'ellipse', cx, cy, rx, ry, fill: solid('#d9d9d9'), stroke: null, ...init };
}
export function createPath(nodes: PathNode[], closed: boolean, init: Partial<PathElement> = {}): PathElement {
  return { ...base('Path'), type: 'path', nodes, closed, extra: [], fillRule: 'nonzero', fill: closed ? solid('#d9d9d9') : null, stroke: defaultStroke(), ...init };
}
export function createGroup(children: Element[], init: Partial<GroupElement> = {}): GroupElement {
  return { ...base('Group'), type: 'group', children, ...init };
}
export function createLayer(name: string): Layer {
  return { id: newId(), name, visible: true, locked: false, children: [] };
}
export function createArtboard(name: string, x: number, y: number, w: number, h: number, background: string | null = '#ffffff'): Artboard {
  return { id: newId(), name, x, y, w, h, background };
}

export function createDocument(name = 'Untitled', w = 1920, h = 1080): VDocument {
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    id: newId(),
    name,
    ppi: 72,
    artboards: [createArtboard('Artboard 1', 0, 0, w, h)],
    layers: [createLayer('Layer 1')],
  };
}

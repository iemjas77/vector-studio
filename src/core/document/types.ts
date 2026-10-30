import type { Matrix, PathNode } from '../geometry/types';

export const FORMAT_NAME = 'vector-studio';
export const FORMAT_VERSION = 1;

export interface SolidPaint {
  type: 'solid';
  /** #rrggbb */
  color: string;
  /** 0..1 */
  alpha: number;
}
export type Paint = SolidPaint;

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

export interface Stroke {
  paint: Paint;
  width: number;
  cap: LineCap;
  join: LineJoin;
  miterLimit: number;
  dash: number[];
}

interface BaseElement {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1 */
  opacity: number;
  /** Local → parent transform. */
  transform: Matrix;
}

export interface ShapeStyle {
  fill: Paint | null;
  stroke: Stroke | null;
}

export interface RectElement extends BaseElement, ShapeStyle {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
}
export interface EllipseElement extends BaseElement, ShapeStyle {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface PathElement extends BaseElement, ShapeStyle {
  type: 'path';
  nodes: PathNode[];
  closed: boolean;
}
export interface GroupElement extends BaseElement {
  type: 'group';
  children: Element[];
}

export type ShapeElement = RectElement | EllipseElement | PathElement;
export type Element = ShapeElement | GroupElement;

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  children: Element[];
}

export interface Artboard {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Artboard background; null = transparent (exports with alpha). */
  background: string | null;
}

export interface VDocument {
  format: typeof FORMAT_NAME;
  version: number;
  id: string;
  name: string;
  /** Pixels per inch used for print dimensions. */
  ppi: number;
  artboards: Artboard[];
  layers: Layer[];
}

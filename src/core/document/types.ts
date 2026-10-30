import type { Matrix, PathNode } from '../geometry/types';

export const FORMAT_NAME = 'vector-studio';
export const FORMAT_VERSION = 2;

export interface SolidPaint {
  type: 'solid';
  /** #rrggbb */
  color: string;
  /** 0..1 */
  alpha: number;
}
export interface GradientStop {
  /** 0..1 */
  offset: number;
  color: string;
  alpha: number;
}
/** Gradient geometry is in object-bounding-box units (0..1), so it follows the object when it is resized. */
export interface LinearGradientPaint {
  type: 'linear';
  stops: GradientStop[];
  x1: number; y1: number; x2: number; y2: number;
}
export interface RadialGradientPaint {
  type: 'radial';
  stops: GradientStop[];
  cx: number; cy: number;
  /** Radius as a fraction of the bounding box (the circle becomes an ellipse for non-square boxes, as in SVG). */
  r: number;
}
export type GradientPaint = LinearGradientPaint | RadialGradientPaint;
export type Paint = SolidPaint | GradientPaint;

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

export interface Stroke {
  paint: SolidPaint;
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
export type FillRule = 'nonzero' | 'evenodd';
export interface Subpath {
  nodes: PathNode[];
  closed: boolean;
}
/** A path with one primary subpath (`nodes`/`closed`) plus optional extra subpaths (compound path, e.g. holes). */
export interface PathElement extends BaseElement, ShapeStyle {
  type: 'path';
  nodes: PathNode[];
  closed: boolean;
  extra: Subpath[];
  fillRule: FillRule;
}
export interface GroupElement extends BaseElement {
  type: 'group';
  children: Element[];
  /** Clipping mask: the top-most child is the clip path; the other children are clipped to it. */
  clip?: boolean;
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

export interface Guide {
  id: string;
  /** 'v' = vertical line at x = pos, 'h' = horizontal line at y = pos (document units). */
  axis: 'v' | 'h';
  pos: number;
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
  guides?: Guide[];
}

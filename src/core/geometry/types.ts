export interface Vec {
  x: number;
  y: number;
}

/** Rect in document units. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 2D affine matrix [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number];

/**
 * A Bezier path node. Handles are stored RELATIVE to the anchor so moving a node
 * moves its handles. A zero handle means "no handle" (straight side).
 */
export interface PathNode {
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
}

/** Cubic Bezier segment in absolute coordinates. */
export interface Cubic {
  p0: Vec;
  p1: Vec;
  p2: Vec;
  p3: Vec;
}

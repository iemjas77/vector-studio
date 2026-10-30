import type { Rect, Vec } from '../core/geometry/types';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;

/** Pan/zoom state. Screen (CSS px) = doc * zoom + pan. */
export class Viewport {
  zoom = 1;
  panX = 0;
  panY = 0;
  width = 800;
  height = 600;

  toDoc(sx: number, sy: number): Vec {
    return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
  }
  toScreen(p: Vec): Vec {
    return { x: p.x * this.zoom + this.panX, y: p.y * this.zoom + this.panY };
  }
  setSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }
  /** Zoom keeping the document point under the screen point fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const d = this.toDoc(sx, sy);
    this.zoom = z;
    this.panX = sx - d.x * z;
    this.panY = sy - d.y * z;
  }
  setZoomCentered(z: number): void {
    this.zoomAt(this.width / 2, this.height / 2, z / this.zoom);
  }
  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }
  /** Fit a doc-space rect into the view with a margin (CSS px). */
  fit(r: Rect, margin = 48): void {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((this.width - margin * 2) / r.w, (this.height - margin * 2) / r.h)));
    this.zoom = isFinite(z) ? z : 1;
    this.panX = this.width / 2 - (r.x + r.w / 2) * this.zoom;
    this.panY = this.height / 2 - (r.y + r.h / 2) * this.zoom;
  }
  zoomToRect(r: Rect): void {
    if (r.w < 1e-6 || r.h < 1e-6) return;
    this.fit(r, 0);
  }
}

import type { OverlayModel } from '../editor/types';
import type { Viewport } from '../editor/viewport';
import { HANDLES, handlePoint } from '../editor/tools/select';
import { tracePath } from './canvas2d';

const BLUE = '#4d9cff';
const HANDLE = 7;

/** Draws selection chrome on top of the document in screen space (crisp at any zoom). */
export function drawOverlay(ctx: CanvasRenderingContext2D, m: OverlayModel, vp: Viewport, dpr: number): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = (x: number, y: number) => vp.toScreen({ x, y });

  // Outlines of selected shapes.
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 1;
  for (const o of m.outlines) {
    ctx.beginPath();
    tracePath(ctx, o.nodes.map((n) => ({ ...vp2(vp, n), inX: n.inX * vp.zoom, inY: n.inY * vp.zoom, outX: n.outX * vp.zoom, outY: n.outY * vp.zoom })), o.closed);
    ctx.stroke();
  }

  if (m.bbox) {
    const b = m.bbox;
    const tl = S(b.x, b.y), br = S(b.x + b.w, b.y + b.h);
    ctx.strokeStyle = BLUE;
    ctx.strokeRect(Math.round(tl.x) + 0.5, Math.round(tl.y) + 0.5, Math.round(br.x - tl.x), Math.round(br.y - tl.y));
    ctx.fillStyle = '#ffffff';
    for (const h of HANDLES) {
      const p = vp.toScreen(handlePoint(b, h));
      ctx.fillRect(Math.round(p.x - HANDLE / 2), Math.round(p.y - HANDLE / 2), HANDLE, HANDLE);
      ctx.strokeRect(Math.round(p.x - HANDLE / 2) + 0.5, Math.round(p.y - HANDLE / 2) + 0.5, HANDLE - 1, HANDLE - 1);
    }
  }

  for (const list of m.anchors) {
    for (const a of list) {
      const p = S(a.x, a.y);
      ctx.strokeStyle = BLUE;
      for (const h of [a.hIn, a.hOut]) {
        if (!h) continue;
        const hp = S(h.x, h.y);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(hp.x, hp.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = BLUE; ctx.fill();
      }
      ctx.fillStyle = a.selected ? BLUE : '#ffffff';
      ctx.fillRect(Math.round(p.x - HANDLE / 2), Math.round(p.y - HANDLE / 2), HANDLE, HANDLE);
      ctx.strokeRect(Math.round(p.x - HANDLE / 2) + 0.5, Math.round(p.y - HANDLE / 2) + 0.5, HANDLE - 1, HANDLE - 1);
    }
  }

  if (m.pen) {
    const nodes = m.pen.nodes;
    ctx.strokeStyle = BLUE;
    ctx.beginPath();
    const scaled = nodes.map((n) => ({ ...vp2(vp, n), inX: n.inX * vp.zoom, inY: n.inY * vp.zoom, outX: n.outX * vp.zoom, outY: n.outY * vp.zoom }));
    tracePath(ctx, scaled, false);
    ctx.stroke();
    if (m.pen.cursor && nodes.length) {
      const last = nodes[nodes.length - 1];
      const a = S(last.x, last.y), c = S(m.pen.cursor.x, m.pen.cursor.y);
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (last.outX || last.outY) ctx.bezierCurveTo(a.x + last.outX * vp.zoom, a.y + last.outY * vp.zoom, c.x, c.y, c.x, c.y);
      else ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    nodes.forEach((n, i) => {
      const p = S(n.x, n.y);
      ctx.fillStyle = i === 0 && nodes.length > 1 ? BLUE : '#ffffff';
      ctx.fillRect(Math.round(p.x - 3.5), Math.round(p.y - 3.5), 7, 7);
      ctx.strokeRect(Math.round(p.x - 3.5) + 0.5, Math.round(p.y - 3.5) + 0.5, 6, 6);
      if (n.outX || n.outY) {
        for (const s of [1, -1]) {
          const hp = S(n.x + n.outX * s, n.y + n.outY * s);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(hp.x, hp.y); ctx.stroke();
          ctx.beginPath(); ctx.arc(hp.x, hp.y, 3, 0, Math.PI * 2); ctx.fillStyle = BLUE; ctx.fill();
        }
      }
    });
  }

  if (m.lasso && m.lasso.length > 1) {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = BLUE;
    ctx.beginPath();
    m.lasso.forEach((p, i) => { const s = S(p.x, p.y); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
    ctx.closePath();
    ctx.fillStyle = 'rgba(77,156,255,0.08)';
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (m.rubber && m.rubber.w > 0 && m.rubber.h > 0) {
    const tl = S(m.rubber.x, m.rubber.y), br = S(m.rubber.x + m.rubber.w, m.rubber.y + m.rubber.h);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = BLUE;
    ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, br.x - tl.x, br.y - tl.y);
    ctx.setLineDash([]);
  }
  if (m.marquee) {
    const tl = S(m.marquee.x, m.marquee.y), br = S(m.marquee.x + m.marquee.w, m.marquee.y + m.marquee.h);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = BLUE;
    ctx.fillStyle = 'rgba(77,156,255,0.08)';
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, br.x - tl.x, br.y - tl.y);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function vp2(vp: Viewport, n: { x: number; y: number }) {
  const p = vp.toScreen(n);
  return { x: p.x, y: p.y };
}

const GUIDE = '#18c8c8';
const SNAP = '#ff3da8';

/** Guides and active snap lines, drawn across the whole viewport. */
export function drawGuides(ctx: CanvasRenderingContext2D, guides: readonly { axis: 'v' | 'h'; pos: number }[], snap: { x: number | null; y: number | null }, vp: Viewport, dpr: number): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1;
  const line = (axis: 'v' | 'h', pos: number, color: string, dash: number[]) => {
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.beginPath();
    if (axis === 'v') { const x = Math.round(pos * vp.zoom + vp.panX) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, vp.height); }
    else { const y = Math.round(pos * vp.zoom + vp.panY) + 0.5; ctx.moveTo(0, y); ctx.lineTo(vp.width, y); }
    ctx.stroke();
  };
  for (const g of guides) line(g.axis, g.pos, GUIDE, []);
  if (snap.x !== null) line('v', snap.x, SNAP, [4, 3]);
  if (snap.y !== null) line('h', snap.y, SNAP, [4, 3]);
  ctx.restore();
}

/** Pick a "nice" tick step (1, 2, 5 × 10^n) giving ≥ minPx between major ticks. */
export function rulerStep(zoom: number, minPx = 60): number {
  const raw = minPx / zoom;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

export function drawRulers(ctx: CanvasRenderingContext2D, vp: Viewport, dpr: number, size: number, hover: { x: number; y: number } | null): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, vp.width, size);
  ctx.fillRect(0, 0, size, vp.height);
  ctx.strokeStyle = '#555';
  ctx.beginPath();
  ctx.moveTo(0, size + 0.5); ctx.lineTo(vp.width, size + 0.5);
  ctx.moveTo(size + 0.5, 0); ctx.lineTo(size + 0.5, vp.height);
  ctx.stroke();
  ctx.fillStyle = '#9a9a9a';
  ctx.strokeStyle = '#777';
  ctx.font = '10px system-ui, sans-serif';
  const step = rulerStep(vp.zoom);
  const minor = step / 5;
  const x0 = Math.floor(-vp.panX / vp.zoom / minor) * minor, x1 = (vp.width - vp.panX) / vp.zoom;
  for (let v = x0; v <= x1; v += minor) {
    const sx = Math.round(v * vp.zoom + vp.panX) + 0.5;
    if (sx < size) continue;
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    ctx.beginPath(); ctx.moveTo(sx, major ? 4 : size - 6); ctx.lineTo(sx, size); ctx.stroke();
    if (major) { ctx.textBaseline = 'top'; ctx.fillText(String(Math.round(v * 100) / 100), sx + 3, 2); }
  }
  const y0 = Math.floor(-vp.panY / vp.zoom / minor) * minor, y1 = (vp.height - vp.panY) / vp.zoom;
  for (let v = y0; v <= y1; v += minor) {
    const sy = Math.round(v * vp.zoom + vp.panY) + 0.5;
    if (sy < size) continue;
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    ctx.beginPath(); ctx.moveTo(major ? 4 : size - 6, sy); ctx.lineTo(size, sy); ctx.stroke();
    if (major) {
      ctx.save(); ctx.translate(2, sy + 3); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'top'; ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(v * 100) / 100), 0, 0); ctx.restore();
    }
  }
  if (hover) {
    const hs = vp.toScreen(hover);
    ctx.strokeStyle = '#4d9cff';
    ctx.beginPath(); ctx.moveTo(hs.x + 0.5, 0); ctx.lineTo(hs.x + 0.5, size); ctx.moveTo(0, hs.y + 0.5); ctx.lineTo(size, hs.y + 0.5); ctx.stroke();
  }
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

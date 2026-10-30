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

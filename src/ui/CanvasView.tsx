import { useEffect, useRef } from 'react';
import { renderView } from '../render/canvas2d';
import { drawOverlay } from '../render/overlay';
import { useApp } from './hooks';
import { useUi } from './store';

export function CanvasView() {
  const app = useApp();
  const ed = app.ed;
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const spaceDown = useUi((s) => s.spaceDown);
  const panMode = useRef<'none' | 'middle' | 'space'>('none');

  // Resize canvas to its container at device resolution (handles high-DPI and multi-monitor DPR changes).
  useEffect(() => {
    const el = wrap.current!;
    const canvas = ref.current!;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = el.getBoundingClientRect();
      const firstSize = ed.viewport.width === 800 && ed.viewport.height === 600 && ed.history.revision === 0 && !ed.history.canUndo;
      ed.viewport.setSize(r.width, r.height);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      if (firstSize) ed.fitArtboard(); else ed.emit();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    // devicePixelRatio changes when moving between monitors.
    const mq = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    let m = mq();
    const onDpr = () => { resize(); m.removeEventListener('change', onDpr); m = mq(); m.addEventListener('change', onDpr); };
    m.addEventListener('change', onDpr);
    return () => { ro.disconnect(); m.removeEventListener('change', onDpr); };
  }, [ed]);

  // Redraw (coalesced to one per animation frame) whenever anything changes.
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const off = (w: number, h: number) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return { canvas: c, ctx: c.getContext('2d')! };
      };
      renderView(ctx, ed.doc, { zoom: ed.viewport.zoom, panX: ed.viewport.panX, panY: ed.viewport.panY, width: ed.viewport.width, height: ed.viewport.height, dpr, activeArtboardId: ed.activeArtboardId }, { makeCanvas: off });
      drawOverlay(ctx, ed.getOverlay(), ed.viewport, dpr);
    });
    return () => cancelAnimationFrame(raf.current);
  });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId);
    const p = local(e);
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      panMode.current = e.button === 1 ? 'middle' : 'space';
      ed.panBegin(p.x, p.y);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    // Clicking the canvas should not leave a text field focused.
    (document.activeElement as HTMLElement | null)?.blur?.();
    ed.pointerDown(p.x, p.y, { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, detail: e.detail });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (panMode.current !== 'none') { ed.panMove(p.x, p.y); return; }
    ed.pointerMove(p.x, p.y, { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = local(e);
    if (panMode.current !== 'none') { panMode.current = 'none'; ed.panEnd(); return; }
    ed.pointerUp(p.x, p.y, { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey });
  };

  // Wheel must be a non-passive native listener to preventDefault.
  useEffect(() => {
    const canvas = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      if (e.ctrlKey || e.metaKey || e.altKey) ed.wheelZoom(p.x, p.y, e.deltaY);
      else if (e.shiftKey) ed.wheelPan(e.deltaY, 0);
      else ed.wheelPan(e.deltaX, e.deltaY);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [ed]);

  const cursor = spaceDown || ed.panning ? (ed.panning ? 'grabbing' : 'grab') : ed.tool.cursor(ed, ed.hover);
  return (
    <div ref={wrap} className="relative flex-1 min-w-0 min-h-0 overflow-hidden" data-testid="canvas-wrap">
      <canvas
        ref={ref} data-testid="canvas" style={{ cursor, touchAction: 'none', display: 'block' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerLeave={() => { ed.hover = null; }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

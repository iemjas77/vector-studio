import type { Rect, Vec } from '../../core/geometry/types';
import type { Tool } from '../types';
import { normRect } from './select';

export function handTool(): Tool {
  return {
    id: 'hand', label: 'Hand', shortcut: 'H',
    cursor: (ed) => (ed.panning ? 'grabbing' : 'grab'),
    down(ed, e) { ed.panBegin(e.screen.x, e.screen.y); },
    move(ed, e) { ed.panMove(e.screen.x, e.screen.y); },
    up(ed) { ed.panEnd(); },
    cancel(ed) { ed.panEnd(); },
  };
}

export function zoomTool(): Tool {
  let start: Vec | null = null;
  let startScreen: Vec = { x: 0, y: 0 };
  return {
    id: 'zoom', label: 'Zoom', shortcut: 'Z',
    cursor: () => 'zoom-in',
    down(_ed, e) { start = e.p; startScreen = e.screen; },
    move(ed, e) { if (start) ed.marquee = normRect(start, e.p); },
    up(ed, e) {
      const r: Rect | null = ed.marquee;
      ed.marquee = null;
      const dragged = Math.hypot(e.screen.x - startScreen.x, e.screen.y - startScreen.y) > 4;
      if (dragged && r) { ed.viewport.zoomToRect(r); }
      else ed.viewport.zoomAt(e.screen.x, e.screen.y, e.alt ? 1 / 2 : 2);
      start = null;
    },
    cancel(ed) { ed.marquee = null; start = null; },
  };
}

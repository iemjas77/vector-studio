import { addElement, createText, getElement, hitTest, newId, solid } from '../../core/document';
import type { Vec } from '../../core/geometry/types';
import type { Tool } from '../types';

const DRAG_MIN = 12; // screen px before a drag makes a text box

/** Type tool: click = point text, drag = area text (wraps), click on existing text = edit it. */
export function textTool(): Tool {
  let start: Vec | null = null;
  let startScreen: Vec = { x: 0, y: 0 };
  return {
    id: 'text', label: 'Type', shortcut: 'T',
    cursor: () => 'text',
    down(ed, e) {
      const hit = hitTest(ed.doc, e.p, ed.hitTol(), false);
      if (hit && getElement(ed.doc, hit)?.type === 'text') {
        ed.select([hit]);
        ed.requestTextFocus();
        start = null;
        return;
      }
      start = e.p; startScreen = e.screen;
    },
    move(ed, e) {
      if (!start) return;
      const w = Math.abs(e.p.x - start.x), h = Math.abs(e.p.y - start.y);
      ed.rubber = Math.hypot(e.screen.x - startScreen.x, e.screen.y - startScreen.y) >= DRAG_MIN ? { x: Math.min(start.x, e.p.x), y: Math.min(start.y, e.p.y), w, h } : null;
    },
    up(ed, e) {
      if (!start) return;
      const dragged = Math.hypot(e.screen.x - startScreen.x, e.screen.y - startScreen.y) >= DRAG_MIN;
      const size = 48;
      const x = dragged ? Math.min(start.x, e.p.x) : start.x;
      const y = dragged ? Math.min(start.y, e.p.y) + size : start.y; // area text: first baseline one line below the top edge
      const el = createText(x, y, 'Text', {
        id: newId(), fontSize: size, width: dragged ? Math.abs(e.p.x - start.x) : 0,
        fill: ed.fillChosen && ed.style.fill ? ed.style.fill : solid('#000000'), stroke: null,
      });
      ed.apply('Create text', (d) => addElement(d, el, ed.activeLayerId));
      ed.select([el.id]);
      ed.requestTextFocus();
      ed.rubber = null;
      start = null;
    },
    cancel(ed) { ed.rubber = null; start = null; },
  };
}

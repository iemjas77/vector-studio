import { createPath, defaultStroke, newId, type PathElement } from '../../core/document';
import { node } from '../../core/geometry/path';
import type { PathNode, Vec } from '../../core/geometry/types';
import type { Editor } from '../editor';
import type { Tool } from '../types';

/**
 * Pen tool. click = corner anchor; click-drag = smooth anchor with symmetric handles;
 * click on the first anchor closes; Enter / Esc / double-click finishes an open path;
 * Backspace removes the last anchor. The whole path is one undo step.
 */
export function penTool(): Tool {
  let id: string | null = null;
  let nodes: PathNode[] = [];
  let dragStart: Vec | null = null; // set while dragging out handles of the newest anchor
  let startScreen: Vec = { x: 0, y: 0 };

  const sync = (ed: Editor, closed = false) => {
    if (!id) return;
    const nid = id;
    const snapshot = nodes.map((n) => ({ ...n }));
    ed.history.restoreBase();
    const el: PathElement = createPath(snapshot, closed, {
      id: nid, name: 'Path',
      fill: closed ? ed.style.fill : null,
      stroke: ed.style.stroke ?? defaultStroke('#000000', 1),
    });
    ed.history.update((d) => { d.layers.find((l) => l.id === ed.activeLayerId)!.children.push(el); });
    ed.selection = [nid];
  };

  const finish = (ed: Editor, closed: boolean) => {
    if (!id) return;
    if (nodes.length < 2) {
      ed.history.cancel();
      ed.selection = [];
    } else {
      sync(ed, closed);
      ed.history.commit(closed ? 'Draw closed path' : 'Draw path');
    }
    id = null; nodes = []; dragStart = null;
    ed.penPreview = null;
  };

  const preview = (ed: Editor, cursor: Vec | null) => {
    ed.penPreview = id ? { nodes: nodes.map((n) => ({ ...n })), closed: false, cursor } : null;
  };

  return {
    id: 'pen', label: 'Pen', shortcut: 'P',
    cursor: () => 'crosshair',
    down(ed, e) {
      startScreen = e.screen;
      if (!id) {
        id = newId();
        nodes = [node(e.p.x, e.p.y)];
        ed.history.begin();
        dragStart = e.p;
        sync(ed);
        preview(ed, e.p);
        return;
      }
      // Close on first anchor.
      const first = nodes[0];
      if (nodes.length >= 2 && Math.hypot(first.x - e.p.x, first.y - e.p.y) <= ed.hitTol(8)) {
        finish(ed, true);
        return;
      }
      let p = e.p;
      const prev = nodes[nodes.length - 1];
      if (e.shift) { // constrain to 45° from the previous anchor
        const dx = p.x - prev.x, dy = p.y - prev.y;
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        p = { x: prev.x + Math.cos(ang) * len, y: prev.y + Math.sin(ang) * len };
      }
      if (e.detail >= 2 && Math.hypot(prev.x - p.x, prev.y - p.y) <= ed.hitTol(6)) { finish(ed, false); return; }
      nodes.push(node(p.x, p.y));
      dragStart = p;
      sync(ed);
      preview(ed, p);
    },
    move(ed, e) {
      if (!id) return;
      if (ed.dragging && dragStart) {
        if (Math.hypot(e.screen.x - startScreen.x, e.screen.y - startScreen.y) >= 3) {
          const n = nodes[nodes.length - 1];
          n.outX = e.p.x - n.x; n.outY = e.p.y - n.y;
          n.inX = -n.outX; n.inY = -n.outY;
          sync(ed);
        }
      }
      preview(ed, e.p);
    },
    up() { dragStart = null; },
    cancel(ed) {
      if (id) finish(ed, false);
      ed.penPreview = null;
    },
    key(ed, key) {
      if (!id) return false;
      if (key === 'Enter' || key === 'Escape') { finish(ed, false); return true; }
      if (key === 'Backspace' || key === 'Delete') {
        nodes.pop();
        if (nodes.length === 0) { ed.history.cancel(); id = null; ed.selection = []; ed.penPreview = null; } else { sync(ed); preview(ed, null); }
        return true;
      }
      return false;
    },
  };
}

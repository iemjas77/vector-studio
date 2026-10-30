import { elementNodes, getElement, hitTest, locate, setPathNodes, transformWorld, worldMatrix, type Element } from '../../core/document';
import { insertNodeAt, nearestOnPath, toggleSmooth } from '../../core/geometry/path';
import { apply, applyVector, invert, translate } from '../../core/geometry/matrix';
import type { Matrix, PathNode, Rect, Vec } from '../../core/geometry/types';
import { invertLinear, type Editor } from '../editor';
import type { Tool } from '../types';
import { normRect } from './select';

type Mode = 'none' | 'node' | 'handle' | 'segment' | 'move' | 'marquee';
const DRAG_THRESHOLD = 3;

function shapeIds(ed: Editor): string[] {
  const out: string[] = [];
  const walk = (els: Element[]) => els.forEach((e) => {
    if (!e.visible || e.locked) return;
    if (e.type === 'group') walk(e.children); else out.push(e.id);
  });
  ed.doc.layers.forEach((l) => { if (l.visible && !l.locked) walk(l.children); });
  return out;
}

/** True if both handles exist and point in opposite directions (a smooth anchor). */
function isLinked(n: PathNode): boolean {
  const a = Math.hypot(n.inX, n.inY), b = Math.hypot(n.outX, n.outY);
  if (a < 1e-9 || b < 1e-9) return false;
  const cross = n.inX * n.outY - n.inY * n.outX;
  const dot = n.inX * n.outX + n.inY * n.outY;
  return Math.abs(cross) < 1e-3 * a * b && dot < 0;
}

export function directTool(): Tool {
  let mode: Mode = 'none';
  let start: Vec = { x: 0, y: 0 };
  let startScreen: Vec = { x: 0, y: 0 };
  let moved = false;
  let shiftOnDown = false;
  let ids: string[] = [];
  // Per-gesture data
  let baseNodes: Record<string, PathNode[]> = {};
  let baseW: Record<string, Matrix> = {};
  let handleInfo: { id: string; index: number; which: 'in' | 'out'; linked: boolean } | null = null;
  let segInfo: { id: string; seg: number; t: number } | null = null;

  const reset = () => { mode = 'none'; moved = false; handleInfo = null; segInfo = null; baseNodes = {}; baseW = {}; };

  const snapshot = (ed: Editor, targets: string[]) => {
    for (const id of targets) {
      const el = getElement(ed.doc, id);
      if (!el || el.type === 'group') continue;
      baseNodes[id] = elementNodes(el).map((n) => ({ ...n }));
      baseW[id] = worldMatrix(ed.doc, id);
    }
  };

  return {
    id: 'direct', label: 'Direct Selection', shortcut: 'A',
    cursor: () => 'default',
    down(ed, e) {
      reset();
      start = e.p; startScreen = e.screen; shiftOnDown = e.shift;
      const tol = ed.hitTol(6);
      const sel = [...ed.selection];

      // 1. Bezier handles of selected anchors
      for (const id of sel) {
        const wn = ed.worldNodes(id);
        if (!wn) continue;
        for (const i of ed.selectedNodeIndices(id)) {
          const n = wn.nodes[i];
          for (const which of ['in', 'out'] as const) {
            const hx = n.x + (which === 'in' ? n.inX : n.outX), hy = n.y + (which === 'in' ? n.inY : n.outY);
            if ((which === 'in' ? n.inX || n.inY : n.outX || n.outY) && Math.hypot(hx - e.p.x, hy - e.p.y) <= tol) {
              mode = 'handle';
              snapshot(ed, [id]);
              handleInfo = { id, index: i, which, linked: isLinked(baseNodes[id][i]) };
              ed.history.begin();
              return;
            }
          }
        }
      }
      // 2. Anchors
      for (const id of sel) {
        const wn = ed.worldNodes(id);
        if (!wn) continue;
        for (let i = wn.nodes.length - 1; i >= 0; i--) {
          const n = wn.nodes[i];
          if (Math.hypot(n.x - e.p.x, n.y - e.p.y) > tol) continue;
          if (e.alt) {
            ed.apply('Convert anchor point', (d) => {
              const loc = locate(d, id);
              if (!loc || loc.element.type === 'group') return;
              const closed = loc.element.type !== 'path' || loc.element.closed;
              setPathNodes(d, id, toggleSmooth(elementNodes(loc.element).map((x) => ({ ...x })), closed, i));
            });
            return;
          }
          const cur = ed.selectedNodeIndices(id);
          if (e.shift) {
            ed.setNodeSelection({ ...ed.nodeSelection, [id]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] });
          } else if (!cur.includes(i)) ed.setNodeSelection({ [id]: [i] });
          mode = 'node';
          ids = Object.keys(ed.nodeSelection).filter((k) => ed.nodeSelection[k].length);
          snapshot(ed, ids);
          ed.history.begin();
          return;
        }
      }
      // 3. Segments of selected shapes
      for (const id of sel) {
        const wn = ed.worldNodes(id);
        if (!wn || wn.nodes.length < 2) continue;
        const hit = nearestOnPath(wn.nodes, wn.closed, e.p);
        if (!hit || hit.dist > tol) continue;
        const count = wn.nodes.length;
        const a = hit.segment, b = wn.closed ? (hit.segment + 1) % count : hit.segment + 1;
        if (e.detail >= 2) {
          let newIndex = a + 1;
          ed.apply('Add anchor point', (d) => {
            const loc = locate(d, id);
            if (!loc || loc.element.type === 'group') return;
            const closed = loc.element.type !== 'path' || loc.element.closed;
            const nodes = insertNodeAt(elementNodes(loc.element).map((x) => ({ ...x })), closed, hit.segment, hit.t);
            newIndex = hit.segment + 1;
            setPathNodes(d, id, nodes);
          });
          ed.setNodeSelection({ [id]: [newIndex] });
          return;
        }
        ed.setNodeSelection({ [id]: [a, b] });
        mode = 'segment';
        segInfo = { id, seg: hit.segment, t: hit.t };
        snapshot(ed, [id]);
        ed.history.begin();
        return;
      }
      // 4. Whole object (deep)
      const hit = hitTest(ed.doc, e.p, ed.hitTol(), true);
      if (hit) {
        if (e.shift) ed.toggleSelect(hit);
        else if (!ed.selection.includes(hit)) ed.select([hit]);
        else ed.setNodeSelection({});
        mode = 'move';
        ids = [...ed.selection];
        ed.history.begin();
        return;
      }
      // 5. Marquee
      if (!e.shift) ed.select([]);
      mode = 'marquee';
      ed.marquee = { x: e.p.x, y: e.p.y, w: 0, h: 0 };
    },
    move(ed, e) {
      if (mode === 'none') return;
      if (mode === 'marquee') { ed.marquee = normRect(start, e.p); return; }
      if (!moved && Math.hypot(e.screen.x - startScreen.x, e.screen.y - startScreen.y) < DRAG_THRESHOLD) return;
      moved = true;
      const dx = e.p.x - start.x, dy = e.p.y - start.y;
      ed.history.restoreBase();
      if (mode === 'move') {
        let mx = dx, my = dy;
        if (e.shift) { if (Math.abs(dx) > Math.abs(dy)) my = 0; else mx = 0; }
        ed.history.update((d) => transformWorld(d, ids, translate(mx, my)));
        return;
      }
      if (mode === 'node') {
        ed.history.update((d) => {
          for (const id of ids) {
            const inv = invertLinear(baseW[id]);
            if (!inv || !baseNodes[id]) continue;
            const ld = applyVector(inv, { x: dx, y: dy });
            const sel = ed.nodeSelection[id] ?? [];
            setPathNodes(d, id, baseNodes[id].map((n, i) => (sel.includes(i) ? { ...n, x: n.x + ld.x, y: n.y + ld.y } : { ...n })));
          }
        });
        return;
      }
      if (mode === 'handle' && handleInfo) {
        const { id, index, which, linked } = handleInfo;
        const invW = invert(baseW[id]);
        if (!invW) return;
        const lp = apply(invW, e.p);
        ed.history.update((d) => {
          const nodes = baseNodes[id].map((n) => ({ ...n }));
          const n = nodes[index];
          let rx = lp.x - n.x, ry = lp.y - n.y;
          if (e.shift) { // snap handle angle to 45°
            const len = Math.hypot(rx, ry), ang = Math.round(Math.atan2(ry, rx) / (Math.PI / 4)) * (Math.PI / 4);
            rx = Math.cos(ang) * len; ry = Math.sin(ang) * len;
          }
          if (which === 'out') { n.outX = rx; n.outY = ry; } else { n.inX = rx; n.inY = ry; }
          if (linked && !e.alt) {
            const oppLen = which === 'out' ? Math.hypot(n.inX, n.inY) : Math.hypot(n.outX, n.outY);
            const len = Math.hypot(rx, ry) || 1;
            const ox = (-rx / len) * oppLen, oy = (-ry / len) * oppLen;
            if (which === 'out') { n.inX = ox; n.inY = oy; } else { n.outX = ox; n.outY = oy; }
          }
          setPathNodes(d, id, nodes);
        });
        return;
      }
      if (mode === 'segment' && segInfo) {
        const { id, seg, t } = segInfo;
        const inv = invertLinear(baseW[id]);
        if (!inv) return;
        const ld = applyVector(inv, { x: dx, y: dy });
        ed.history.update((d) => {
          const nodes = baseNodes[id].map((n) => ({ ...n }));
          const el = getElement(d, id);
          const closed = !!el && (el.type !== 'path' || el.closed);
          const a = nodes[seg], b = nodes[closed ? (seg + 1) % nodes.length : seg + 1];
          if (!a.outX && !a.outY && !b.inX && !b.inY) {
            a.outX = (b.x - a.x) / 3; a.outY = (b.y - a.y) / 3;
            b.inX = (a.x - b.x) / 3; b.inY = (a.y - b.y) / 3;
          }
          const tt = Math.min(0.85, Math.max(0.15, t));
          const f = 1 / (3 * tt * (1 - tt));
          a.outX += ld.x * f; a.outY += ld.y * f;
          b.inX += ld.x * f; b.inY += ld.y * f;
          setPathNodes(d, id, nodes);
        });
      }
    },
    up(ed, e) {
      if (mode === 'marquee') {
        const r: Rect = normRect(start, e.p);
        ed.marquee = null;
        const sel: Record<string, number[]> = shiftOnDown ? { ...ed.nodeSelection } : {};
        const elems = new Set(shiftOnDown ? ed.selection : []);
        if (r.w > 1 / ed.viewport.zoom || r.h > 1 / ed.viewport.zoom) {
          for (const id of shapeIds(ed)) {
            const wn = ed.worldNodes(id);
            if (!wn) continue;
            const inside = wn.nodes.map((n, i) => (n.x >= r.x && n.x <= r.x + r.w && n.y >= r.y && n.y <= r.y + r.h ? i : -1)).filter((i) => i >= 0);
            if (inside.length) { elems.add(id); sel[id] = [...new Set([...(sel[id] ?? []), ...inside])]; }
          }
        }
        ed.selection = [...elems];
        ed.nodeSelection = sel;
      } else if (mode !== 'none') {
        const label = { node: 'Move anchor points', handle: 'Adjust handle', segment: 'Reshape segment', move: 'Move' }[mode as 'node'];
        ed.history.commit(label);
      }
      reset();
    },
    cancel(ed) { ed.marquee = null; reset(); },
    key(ed, key) {
      if (key === 'Delete' || key === 'Backspace') { ed.deleteSelection(); return true; }
      return false;
    },
  };
}

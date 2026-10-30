import { node } from '../geometry/path';
import type { PathNode } from '../geometry/types';

export interface ParsedSubpath {
  nodes: PathNode[];
  closed: boolean;
}

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|([\s,]+)/y;
  let pos = 0;
  while (pos < d.length) {
    re.lastIndex = pos;
    const m = re.exec(d);
    if (!m) throw new Error(`Invalid path data near "${d.slice(pos, pos + 10)}"`);
    if (m[1]) out.push(m[1]);
    else if (m[2] !== undefined) out.push(parseFloat(m[2]));
    pos = re.lastIndex;
  }
  return out;
}

/** Splits an arc into cubic curves. Returns [c1x,c1y,c2x,c2y,x,y] tuples. */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, fa: number, fs: number, x2: number, y2: number): number[][] {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const sign = fa === fs ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = den === 0 ? 0 : sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2;
  const cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI;
  else if (fs && dth < 0) dth += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
  const delta = dth / segs;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: number[][] = [];
  let a1 = th1;
  for (let i = 0; i < segs; i++) {
    const a2 = a1 + delta;
    const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
    const pt = (px: number, py: number) => [cp * rx * px - sp * ry * py + cx, sp * rx * px + cp * ry * py + cy];
    const e1 = pt(c1 - t * s1, s1 + t * c1);
    const e2 = pt(c2 + t * s2, s2 - t * c2);
    const e = i === segs - 1 ? [x2, y2] : pt(c2, s2);
    out.push([e1[0], e1[1], e2[0], e2[1], e[0], e[1]]);
    a1 = a2;
  }
  return out;
}

/** Parses SVG path data into subpaths of Bezier nodes. Throws on malformed data. */
export function parsePathData(d: string): ParsedSubpath[] {
  const tokens = tokenize(d);
  const subs: ParsedSubpath[] = [];
  let cur: PathNode[] = [];
  let closed = false;
  let x = 0, y = 0, sx = 0, sy = 0;
  let lastCtrl: { x: number; y: number } | null = null; // for S/T reflection
  let lastCmd = '';
  let i = 0;

  const flush = () => {
    if (cur.length > 0) subs.push({ nodes: cur, closed });
    cur = [];
    closed = false;
  };
  const lineTo = (nx: number, ny: number) => { cur.push(node(nx, ny)); x = nx; y = ny; };
  const curveTo = (c1x: number, c1y: number, c2x: number, c2y: number, nx: number, ny: number) => {
    const last = cur[cur.length - 1];
    last.outX = c1x - last.x; last.outY = c1y - last.y;
    cur.push(node(nx, ny, c2x - nx, c2y - ny));
    x = nx; y = ny;
    lastCtrl = { x: c2x, y: c2y };
  };

  let cmd = '';
  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === 'string') { cmd = t; i++; } else if (!cmd) throw new Error('Path data must start with a command');
    else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const need = ARGS[up];
    if (up === 'Z') {
      if (cur.length) {
        closed = true;
        // Merge a duplicated closing node into the first node.
        const first = cur[0], last = cur[cur.length - 1];
        if (cur.length > 1 && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) {
          first.inX = last.inX; first.inY = last.inY;
          cur.pop();
        }
        x = sx; y = sy;
        flush();
        // A following drawing command without M continues from the start point.
        cur = [];
      }
      lastCmd = 'Z'; lastCtrl = null; cmd = '';
      continue;
    }
    if (need === undefined) throw new Error(`Unknown path command "${cmd}"`);
    const a: number[] = [];
    for (let k = 0; k < need; k++) {
      const v = tokens[i + k];
      if (typeof v !== 'number') throw new Error(`Path command "${cmd}" is missing arguments`);
      a.push(v);
    }
    i += need;
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (cur.length === 0 && up !== 'M') { cur = [node(x, y)]; } // implicit start after Z
    switch (up) {
      case 'M': flush(); x = a[0] + ox; y = a[1] + oy; sx = x; sy = y; cur = [node(x, y)]; lastCtrl = null; break;
      case 'L': lineTo(a[0] + ox, a[1] + oy); lastCtrl = null; break;
      case 'H': lineTo(a[0] + ox, y); lastCtrl = null; break;
      case 'V': lineTo(x, a[0] + oy); lastCtrl = null; break;
      case 'C': curveTo(a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy); break;
      case 'S': {
        const prevWasCurve = 'CcSs'.includes(lastCmd) && lastCtrl;
        const c1x = prevWasCurve ? 2 * x - lastCtrl!.x : x;
        const c1y = prevWasCurve ? 2 * y - lastCtrl!.y : y;
        curveTo(c1x, c1y, a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy);
        break;
      }
      case 'Q': case 'T': {
        let qx: number, qy: number, ex: number, ey: number;
        if (up === 'Q') { qx = a[0] + ox; qy = a[1] + oy; ex = a[2] + ox; ey = a[3] + oy; } else {
          const prevWasQuad = 'QqTt'.includes(lastCmd) && lastCtrl;
          qx = prevWasQuad ? 2 * x - lastCtrl!.x : x;
          qy = prevWasQuad ? 2 * y - lastCtrl!.y : y;
          ex = a[0] + ox; ey = a[1] + oy;
        }
        const x0 = x, y0 = y;
        curveTo(x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
        lastCtrl = { x: qx, y: qy };
        break;
      }
      case 'A': {
        const ex = a[5] + ox, ey = a[6] + oy;
        if (ex === x && ey === y) break;
        for (const c of arcToCubics(x, y, a[0], a[1], a[2], a[3] ? 1 : 0, a[4] ? 1 : 0, ex, ey)) curveTo(c[0], c[1], c[2], c[3], c[4], c[5]);
        lastCtrl = null;
        break;
      }
    }
    lastCmd = cmd;
  }
  if (cur.length > 0) flush();
  return subs.filter((s) => s.nodes.length >= 2);
}

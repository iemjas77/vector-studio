import { isIdentity } from '../geometry/matrix';
import { nodesToSvgD } from '../geometry/path';
import { elementNodes, type Element, type Paint, type Stroke, type VDocument, type Artboard } from '../document';

const n = (v: number) => String(Math.round(v * 1e4) / 1e4);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function paintAttrs(kind: 'fill' | 'stroke', p: Paint | null): string {
  if (!p) return ` ${kind}="none"`;
  let s = ` ${kind}="${p.color}"`;
  if (p.alpha < 1) s += ` ${kind}-opacity="${n(p.alpha)}"`;
  return s;
}

function strokeAttrs(st: Stroke | null): string {
  if (!st) return ' stroke="none"';
  let s = paintAttrs('stroke', st.paint) + ` stroke-width="${n(st.width)}"`;
  if (st.cap !== 'butt') s += ` stroke-linecap="${st.cap}"`;
  if (st.join !== 'miter') s += ` stroke-linejoin="${st.join}"`;
  if (st.join === 'miter' && st.miterLimit !== 4) s += ` stroke-miterlimit="${n(st.miterLimit)}"`;
  if (st.dash.length) s += ` stroke-dasharray="${st.dash.map(n).join(' ')}"`;
  return s;
}

function common(el: Element): string {
  let s = ` id="${esc(el.id)}"`;
  if (el.name) s += ` data-name="${esc(el.name)}"`;
  if (!isIdentity(el.transform)) s += ` transform="matrix(${el.transform.map(n).join(' ')})"`;
  if (el.opacity < 1) s += ` opacity="${n(el.opacity)}"`;
  return s;
}

function elementSvg(el: Element): string {
  if (!el.visible) return '';
  switch (el.type) {
    case 'group':
      return `<g${common(el)}>${el.children.map(elementSvg).join('')}</g>`;
    case 'rect':
      return `<rect${common(el)} x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}"${el.rx ? ` rx="${n(el.rx)}"` : ''}${paintAttrs('fill', el.fill)}${strokeAttrs(el.stroke)}/>`;
    case 'ellipse':
      return `<ellipse${common(el)} cx="${n(el.cx)}" cy="${n(el.cy)}" rx="${n(el.rx)}" ry="${n(el.ry)}"${paintAttrs('fill', el.fill)}${strokeAttrs(el.stroke)}/>`;
    case 'path':
      return `<path${common(el)} d="${nodesToSvgD(elementNodes(el), el.closed)}"${paintAttrs('fill', el.fill)}${strokeAttrs(el.stroke)}/>`;
  }
}

/** Serialises the document (or one artboard) to a standalone SVG string. */
export function exportSvg(doc: VDocument, artboard: Artboard = doc.artboards[0]): string {
  const bg = artboard.background ? `<rect data-role="artboard-background" x="${n(artboard.x)}" y="${n(artboard.y)}" width="${n(artboard.w)}" height="${n(artboard.h)}" fill="${artboard.background}"/>` : '';
  const layers = doc.layers
    .filter((l) => l.visible)
    .map((l) => `<g id="${esc(l.id)}" data-layer="1" data-name="${esc(l.name)}"${l.locked ? ' data-locked="1"' : ''}>${l.children.map(elementSvg).join('')}</g>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(artboard.w)}" height="${n(artboard.h)}" viewBox="${n(artboard.x)} ${n(artboard.y)} ${n(artboard.w)} ${n(artboard.h)}">` +
    bg + layers + `</svg>\n`
  );
}

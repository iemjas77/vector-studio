const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', lime: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
  cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', maroon: '#800000', olive: '#808000', green: '#008000', purple: '#800080', teal: '#008080',
  navy: '#000080', orange: '#ffa500', pink: '#ffc0cb', brown: '#a52a2a', gold: '#ffd700', indigo: '#4b0082',
  violet: '#ee82ee', crimson: '#dc143c', coral: '#ff7f50', salmon: '#fa8072', khaki: '#f0e68c', tan: '#d2b48c',
  turquoise: '#40e0d0', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
  darkred: '#8b0000', darkgreen: '#006400', darkblue: '#00008b', lightblue: '#add8e6', lightgreen: '#90ee90',
  skyblue: '#87ceeb', steelblue: '#4682b4', slategray: '#708090', beige: '#f5f5dc', ivory: '#fffff0',
};

export interface ParsedColor {
  color: string;
  alpha: number;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Parses CSS colour strings (hex, rgb[a], a common subset of names). Returns null for none/unsupported. */
export function parseColor(input: string): ParsedColor | null {
  const s = input.trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent') return null;
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return { color: '#' + h.slice(0, 6), alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s);
  if (m) {
    const ch = (v: string, pct: string) => (pct ? (parseFloat(v) * 255) / 100 : parseFloat(v));
    const a = m[7] === undefined ? 1 : m[8] ? parseFloat(m[7]) / 100 : parseFloat(m[7]);
    return { color: '#' + hex2(ch(m[1], m[2])) + hex2(ch(m[3], m[4])) + hex2(ch(m[5], m[6])), alpha: Math.max(0, Math.min(1, a)) };
  }
  if (NAMED[s]) return { color: NAMED[s], alpha: 1 };
  return null;
}

export function isKnownColor(input: string): boolean {
  const s = input.trim().toLowerCase();
  return s === 'none' || s === 'transparent' || parseColor(s) !== null;
}

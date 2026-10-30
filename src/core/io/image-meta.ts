/** Writes resolution (pixels per inch) into encoded PNG / JPEG bytes so print software reads the right physical size. */

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

export function setPngPpi(png: Uint8Array, ppi: number): Uint8Array {
  if (png.length < 33 || PNG_SIG.some((b, i) => png[i] !== b)) throw new Error('Not a PNG file');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  // Drop an existing pHYs chunk, keep everything else.
  const kept: Uint8Array[] = [png.subarray(0, 8)];
  let pos = 8;
  let ihdrEnd = 8;
  while (pos + 12 <= png.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    const end = pos + 12 + len;
    if (type !== 'pHYs') kept.push(png.subarray(pos, end));
    if (type === 'IHDR') ihdrEnd = kept.length;
    pos = end;
  }
  const ppm = Math.round(ppi / 0.0254);
  const chunk = new Uint8Array(21);
  const cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  cv.setUint32(8, ppm); cv.setUint32(12, ppm); chunk[16] = 1; // unit = metre
  cv.setUint32(17, crc32(chunk.subarray(4, 17)));
  kept.splice(ihdrEnd, 0, chunk);
  const out = new Uint8Array(kept.reduce((s, k) => s + k.length, 0));
  let o = 0;
  for (const k of kept) { out.set(k, o); o += k.length; }
  return out;
}

/** Reads ppi from a PNG's pHYs chunk (null if absent or not in metres). */
export function readPngPpi(png: Uint8Array): number | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  while (pos + 12 <= png.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    if (type === 'pHYs') return view.getUint8(pos + 16) === 1 ? Math.round(view.getUint32(pos + 8) * 0.0254) : null;
    pos += 12 + len;
  }
  return null;
}

/** Sets the JFIF density (dots per inch) of a JPEG that starts with a JFIF APP0 segment. Other JPEGs are returned unchanged. */
export function setJpegPpi(jpg: Uint8Array, ppi: number): Uint8Array {
  const isJfif = jpg.length > 20 && jpg[0] === 0xff && jpg[1] === 0xd8 && jpg[2] === 0xff && jpg[3] === 0xe0 && jpg[6] === 0x4a && jpg[7] === 0x46;
  if (!isJfif) return jpg;
  const out = jpg.slice();
  const d = Math.min(65535, Math.round(ppi));
  out[13] = 1; out[14] = d >> 8; out[15] = d & 255; out[16] = d >> 8; out[17] = d & 255;
  return out;
}

export function readJpegPpi(jpg: Uint8Array): number | null {
  if (!(jpg[0] === 0xff && jpg[1] === 0xd8 && jpg[3] === 0xe0 && jpg[13] === 1)) return null;
  return (jpg[14] << 8) | jpg[15];
}

// System font discovery for the Electron main process: scans font folders and reads family/weight/italic
// from each file's sfnt tables without loading whole files. Only files found by the scan can be read back.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function fontDirs() {
  if (process.platform === 'win32') {
    return [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts')];
  }
  if (process.platform === 'darwin') return ['/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')];
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts'), path.join(os.homedir(), '.local', 'share', 'fonts')];
}

function walk(dir, depth, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 5) walk(p, depth + 1, out); } else if (/\.(ttf|otf|ttc)$/i.test(e.name)) out.push(p);
  }
}

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  const n = fs.readSync(fd, b, 0, len, pos);
  return n === len ? b : b.subarray(0, n);
}

/** Returns { family, style, weight, italic } or null. Exported for tests. */
function readFontInfo(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    let base = 0;
    const head = readAt(fd, 0, 12);
    if (head.length < 12) return null;
    if (head.toString('latin1', 0, 4) === 'ttcf') base = readAt(fd, 12, 4).readUInt32BE(0);
    const dir0 = readAt(fd, base, 12);
    const numTables = dir0.readUInt16BE(4);
    const dir = readAt(fd, base + 12, numTables * 16);
    const tables = {};
    for (let i = 0; i + 16 <= dir.length; i += 16) tables[dir.toString('latin1', i, i + 4)] = { offset: dir.readUInt32BE(i + 8), length: dir.readUInt32BE(i + 12) };
    if (!tables.name || tables.name.length > 1 << 20) return null;
    const nm = readAt(fd, tables.name.offset, tables.name.length);
    const count = nm.readUInt16BE(2), strOff = nm.readUInt16BE(4);
    const names = {};
    for (let i = 0; i < count; i++) {
      const r = 6 + i * 12;
      if (r + 12 > nm.length) break;
      const platform = nm.readUInt16BE(r), id = nm.readUInt16BE(r + 6), len = nm.readUInt16BE(r + 8), off = nm.readUInt16BE(r + 10);
      const raw = nm.subarray(strOff + off, strOff + off + len);
      let s;
      if (platform === 3 || platform === 0) { const sw = Buffer.from(raw); sw.swap16(); s = sw.toString('utf16le'); } else if (platform === 1) s = raw.toString('latin1'); else continue;
      if (s && (!names[id] || platform === 3)) names[id] = s;
    }
    const family = names[16] || names[1];
    if (!family) return null;
    let weight = 400, italic = false;
    if (tables['OS/2'] && tables['OS/2'].length >= 64) {
      const os2 = readAt(fd, tables['OS/2'].offset, 64);
      weight = os2.readUInt16BE(4) || 400;
      italic = (os2.readUInt16BE(62) & 1) !== 0;
    }
    return { family, style: names[17] || names[2] || '', weight: Math.min(1000, Math.max(1, weight)), italic };
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ } }
}

let cache = null;
const byKey = new Map();

function listFonts() {
  if (cache) return cache;
  const files = [];
  for (const d of fontDirs()) walk(d, 0, files);
  cache = [];
  for (const f of files) {
    const info = readFontInfo(f);
    if (!info) continue;
    const key = String(cache.length);
    byKey.set(key, f);
    cache.push({ key, ...info });
  }
  return cache;
}

function readFont(key) {
  listFonts();
  const file = byKey.get(String(key));
  if (!file) throw new Error('Unknown font');
  return fs.readFileSync(file);
}

module.exports = { listFonts, readFont, readFontInfo, fontDirs };

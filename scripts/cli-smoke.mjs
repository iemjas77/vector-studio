// Builds nothing itself: expects dist-cli/main.js (npm run build:cli). Creates a document, runs the real CLI, checks the files.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

const dir = mkdtempSync(join(tmpdir(), 'vs-cli-'));
const solid = (c) => ({ type: 'solid', color: c, alpha: 1 });
const doc = {
  format: 'vector-studio', version: 2, id: 'd', name: 'tee', ppi: 300,
  artboards: [{ id: 'ab', name: 'Front', x: 0, y: 0, w: 900, h: 1080, background: null }],
  layers: [{ id: 'l', name: 'L', visible: true, locked: false, children: [
    { id: 'r', type: 'rect', name: 'R', visible: true, locked: false, opacity: 1, transform: [1, 0, 0, 1, 0, 0], x: 100, y: 100, w: 400, h: 400, rx: 0, fill: solid('#ff0000'), stroke: null },
    { id: 't', type: 'text', name: 'T', visible: true, locked: false, opacity: 1, transform: [1, 0, 0, 1, 0, 0], x: 100, y: 800, width: 0, content: 'Batch', fontFamily: 'Inter', fontSize: 160, fontWeight: 700, italic: false, tracking: 0, lineHeight: 1.2, align: 'left', path: null, pathOffset: 0, fill: solid('#000000'), stroke: null },
  ] }],
};
writeFileSync(join(dir, 'tee.vstudio'), JSON.stringify(doc));
const out = join(dir, 'out');
execFileSync('node', ['dist-cli/main.js', '--out', out, '--format', 'png', '--sizes', '450x540,225x270 small', '--transparent', join(dir, 'tee.vstudio')], { stdio: 'inherit' });
const files = readdirSync(out).sort();
assert.deepEqual(files, ['tee-Front-225x270.png'.replace('225x270', 'small'), 'tee-Front-450x540.png'].sort());
const big = PNG.sync.read(readFileSync(join(out, 'tee-Front-450x540.png')));
assert.equal(big.width, 450); assert.equal(big.height, 540);
assert.equal(big.data[3], 0, 'background must be transparent');
const px = (png, x, y) => [...png.data.slice((png.width * y + x) * 4, (png.width * y + x) * 4 + 4)];
assert.deepEqual(px(big, 125, 125), [255, 0, 0, 255], 'red square scaled by 0.5');
let ink = 0;
for (let y = 380; y < 420; y++) for (let x = 40; x < 300; x++) if (px(big, x, y)[3] > 200) ink++;
assert.ok(ink > 50, `text should have rendered ink (${ink})`);
console.log('cli smoke: OK', files.join(', '));

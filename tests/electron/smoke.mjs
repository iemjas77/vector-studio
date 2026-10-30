// Launches the real Electron app (built renderer in dist/), draws a shape, saves through the native
// IPC path (dialog mocked), then verifies the file on disk. Run: npm run test:electron  (needs a display, e.g. xvfb-run)
import { _electron as electron } from 'playwright';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'vs-electron-'));
const target = join(dir, 'smoke.vstudio');
const app = await electron.launch({ args: ['--no-sandbox', '.'], cwd: process.cwd() });
try {
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="canvas"]');
  assert.equal(await win.title(), 'Vector Studio');
  assert.equal(await win.evaluate(() => typeof window.vsElectron), 'object', 'preload bridge missing');
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, target);
  await win.keyboard.press('m');
  const box = await win.locator('[data-testid="canvas"]').boundingBox();
  await win.mouse.move(box.x + 300, box.y + 200);
  await win.mouse.down();
  await win.mouse.move(box.x + 500, box.y + 350, { steps: 5 });
  await win.mouse.up();
  // Text goes through HarfBuzz (WebAssembly), which needs the app:// protocol + CSP to be right.
  await win.keyboard.press('t');
  await win.mouse.click(box.x + 300, box.y + 500);
  await win.keyboard.type('Hello');
  await win.keyboard.press('Escape');
  const textInfo = await win.evaluate(() => {
    const ed = window.__vs.workspace.current;
    const t = ed.doc.layers[0].children.find((e) => e.type === 'text');
    return t ? { content: t.content, fonts: ed.doc && window.__vs ? true : false } : null;
  });
  assert.equal(textInfo?.content, 'Hello', 'text element was not created');
  const outlineCount = await win.evaluate(async () => {
    const ed = window.__vs.workspace.current;
    ed.convertSelectionToPaths();
    const p = ed.doc.layers[0].children.find((e) => e.type === 'path' && e.extra && e.extra.length >= 0 && e.name.startsWith('Hello'));
    return p ? 1 + p.extra.length : 0;
  });
  assert.ok(outlineCount >= 5, `expected glyph outlines for "Hello", got ${outlineCount}`);
  const sysFonts = await win.evaluate(() => window.vsElectron.listFonts().then((l) => l.length));
  console.log('system fonts discovered:', sysFonts);
  await win.keyboard.press('Control+s');
  await win.waitForFunction(() => document.querySelector('[data-testid="toast"]')?.textContent?.startsWith('Saved'));
  assert.ok(existsSync(target), 'file was not written');
  const doc = JSON.parse(readFileSync(target, 'utf8'));
  assert.equal(doc.format, 'vector-studio');
  assert.equal(doc.layers[0].children.length, 2);
  assert.equal(doc.layers[0].children[0].type, 'rect');
  assert.equal(doc.layers[0].children[1].type, 'path'); // outlined text
  console.log('electron smoke: OK (shape + HarfBuzz text + system font scan)', target);
} finally {
  await app.close().catch(() => {});
}

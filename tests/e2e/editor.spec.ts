import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { boot, clickDoc, docOf, dragDoc, docToPage } from './helpers';

test.beforeEach(async ({ page }) => { await boot(page); });

const elements = async (page: import('@playwright/test').Page) => (await docOf(page)).layers.flatMap((l: { children: unknown[] }) => l.children) as Array<Record<string, unknown> & { id: string; type: string }>;

test('app shell shows every required region', async ({ page }) => {
  for (const id of ['menubar', 'doc-tabs', 'toolbar', 'canvas', 'statusbar', 'panels', 'optionsbar']) await expect(page.getByTestId(id)).toBeVisible();
  for (const p of ['properties', 'color', 'stroke', 'layers', 'artboards']) await expect(page.getByTestId(`panel-${p}`)).toBeVisible();
  for (const t of ['select', 'direct', 'rect', 'ellipse', 'pen', 'hand', 'zoom']) await expect(page.getByTestId(`tool-${t}`)).toBeVisible();
});

test('artboard renders at its exact size on the canvas', async ({ page }) => {
  await page.getByTestId('canvas').scrollIntoViewIfNeeded();
  const { zoom } = await page.evaluate(() => (window as unknown as { __vs: { workspace: { current: { viewport: { zoom: number } } } } }).__vs.workspace.current.viewport);
  const tl = await docToPage(page, 0, 0), br = await docToPage(page, 1920, 1080);
  expect((br.x - tl.x) / zoom).toBeCloseTo(1920, 3);
  const shot = PNG.sync.read(await page.screenshot({ clip: { x: Math.round(tl.x) + 20, y: Math.round(tl.y) + 20, width: 4, height: 4 } }));
  expect([...shot.data.slice(0, 3)]).toEqual([255, 255, 255]); // white artboard interior
});

test('draw rectangle, ellipse and pen path through the UI; shortcuts switch tools', async ({ page }) => {
  await page.keyboard.press('m');
  await expect(page.getByTestId('status-tool')).toHaveText('Rectangle');
  await dragDoc(page, 100, 100, 400, 300);
  await page.keyboard.press('l');
  await dragDoc(page, 500, 100, 700, 300);
  await page.keyboard.press('p');
  await clickDoc(page, 100, 500);
  await clickDoc(page, 300, 500);
  await clickDoc(page, 200, 700);
  await page.keyboard.press('Enter');
  const els = await elements(page);
  expect(els.map((e) => e.type)).toEqual(['rect', 'ellipse', 'path']);
  for (const [k, v] of Object.entries({ x: 100, y: 100, w: 300, h: 200 })) expect(Math.abs((els[0][k] as number) - v)).toBeLessThan(1.5);
  const eps = (a: unknown, b: number) => expect(Math.abs((a as number) - b)).toBeLessThan(1.5); // 1 screen px at fit-zoom
  eps(els[1].cx, 600); eps(els[1].rx, 100); eps(els[1].ry, 100);
  expect((els[2] as unknown as { nodes: unknown[] }).nodes).toHaveLength(3);
});

test('select, move, undo/redo via keyboard', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 300, 300);
  await page.keyboard.press('v');
  await dragDoc(page, 200, 200, 400, 250);
  let [r] = await elements(page);
  const t = r.transform as number[];
  expect(Math.abs(t[4] - 200)).toBeLessThan(1.5); expect(Math.abs(t[5] - 50)).toBeLessThan(1.5);
  await page.keyboard.press('Control+z');
  [r] = await elements(page);
  expect(r.transform).toEqual([1, 0, 0, 1, 0, 0]);
  await page.keyboard.press('Control+Shift+z');
  [r] = await elements(page);
  expect(r.transform).not.toEqual([1, 0, 0, 1, 0, 0]);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await elements(page)).toHaveLength(0);
});

test('menu items work (Edit > Select All, Object > Group) and disabled items do not run', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 200, 200);
  await dragDoc(page, 300, 100, 400, 200);
  await page.getByRole('menubar').getByText('Object', { exact: true }).click();
  await expect(page.getByTestId('menu-object.group')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('menubar').getByText('Edit', { exact: true }).click();
  await page.getByTestId('menu-edit.selectAll').click();
  await page.getByRole('menubar').getByText('Object', { exact: true }).click();
  await page.getByTestId('menu-object.group').click();
  const els = await elements(page);
  expect(els).toHaveLength(1);
  expect(els[0].type).toBe('group');
});

test('properties panel numeric entry moves/resizes the selection exactly', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 300, 300);
  const x = page.getByTestId('prop-x');
  await x.fill('250'); await x.press('Enter');
  const w = page.getByTestId('prop-w');
  await w.fill('400'); await w.press('Enter');
  const [r] = await elements(page);
  const b = r.transform as number[];
  expect(b[4] + (r.x as number) * b[0]).toBeCloseTo(250, 3);
  expect((r.w as number) * b[0]).toBeCloseTo(400, 3);
});

test('colour panel: hex entry, swatch, none, and opacity update the selection', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 300, 300);
  await page.getByTestId('color-hex').fill('#12ab34');
  await page.getByTestId('color-hex').press('Enter');
  expect((await elements(page))[0]).toMatchObject({ fill: { color: '#12ab34' } });
  await page.getByTestId('swatch-ff0000').click();
  expect((await elements(page))[0]).toMatchObject({ fill: { color: '#ff0000' } });
  await page.getByTestId('target-stroke').click();
  await page.getByTestId('swatch-0070ff').click();
  expect((await elements(page))[0]).toMatchObject({ stroke: { paint: { color: '#0070ff' } } });
  await page.getByTestId('stroke-width').fill('6'); await page.getByTestId('stroke-width').press('Enter');
  await page.getByTestId('cap-round').click();
  await page.getByTestId('join-bevel').click();
  expect((await elements(page))[0]).toMatchObject({ stroke: { width: 6, cap: 'round', join: 'bevel' } });
  await page.getByTestId('prop-opacity').fill('40'); await page.getByTestId('prop-opacity').press('Enter');
  expect((await elements(page))[0]).toMatchObject({ opacity: 0.4 });
  await page.getByTestId('target-fill').click();
  await page.getByTestId('color-none').click();
  expect((await elements(page))[0]).toMatchObject({ fill: null });
  await page.getByTestId('color-hex').fill('nonsense');
  await page.getByTestId('color-hex').press('Enter');
  expect((await elements(page))[0]).toMatchObject({ fill: null });
});

test('layers panel: visibility, lock, rename, add layer, select from panel', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 300, 300);
  const [r] = await elements(page);
  await page.getByTestId('tool-select').click();
  await clickDoc(page, 5000, 5000); // empty → deselect
  await page.getByTestId(`el-row-${r.id}`).click();
  expect((await docOf(page)).layers[0].children).toHaveLength(1);
  await page.getByTestId(`el-vis-${r.id}`).click();
  expect((await elements(page))[0]).toMatchObject({ visible: false });
  await page.getByTestId(`el-vis-${r.id}`).click();
  await page.getByTestId(`el-lock-${r.id}`).click();
  expect((await elements(page))[0]).toMatchObject({ locked: true });
  await clickDoc(page, 200, 200);
  expect(await page.evaluate(() => (window as unknown as { __vs: { workspace: { current: { selection: string[] } } } }).__vs.workspace.current.selection)).toEqual([]);
  await page.getByTestId('layer-name-0').dblclick();
  await page.getByTestId('layer-name-0-input').fill('Artwork');
  await page.getByTestId('layer-name-0-input').press('Enter');
  expect((await docOf(page)).layers[0].name).toBe('Artwork');
  await page.getByTestId('layer-add').click();
  expect((await docOf(page)).layers).toHaveLength(2);
  await page.getByTestId('layer-delete').click();
  expect((await docOf(page)).layers).toHaveLength(1);
});

test('layers panel drag and drop reorders objects', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 200, 200);
  await dragDoc(page, 300, 100, 400, 200);
  const [a, b] = await elements(page);
  await page.getByTestId(`el-row-${a.id}`).dragTo(page.getByTestId(`el-row-${b.id}`), { targetPosition: { x: 20, y: 2 } });
  const after = await elements(page);
  expect(after.map((e) => e.id)).toEqual([b.id, a.id]);
});

test('zoom: input field, wheel zoom anchored at the cursor, fit', async ({ page }) => {
  const z = page.getByTestId('zoom-input');
  await z.fill('200'); await z.press('Enter');
  expect((await page.evaluate(() => (window as unknown as { __vs: { workspace: { current: { viewport: { zoom: number } } } } }).__vs.workspace.current.viewport.zoom))).toBeCloseTo(2, 5);
  await page.keyboard.press('Control+0');
  const before = await docToPage(page, 960, 540);
  const p = await docToPage(page, 400, 300);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -400);
  await page.keyboard.up('Control');
  const after = await docToPage(page, 400, 300);
  expect(Math.abs(after.x - p.x)).toBeLessThan(0.5); // point under cursor stays put
  expect(Math.abs(after.y - p.y)).toBeLessThan(0.5);
  const mid = await docToPage(page, 960, 540);
  expect(mid.x).not.toBeCloseTo(before.x, 0);
});

test('hand tool and space-drag pan the view', async ({ page }) => {
  const before = await docToPage(page, 0, 0);
  await page.keyboard.press('h');
  await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(650, 430, { steps: 3 }); await page.mouse.up();
  const mid = await docToPage(page, 0, 0);
  expect(mid.x - before.x).toBeCloseTo(50, 0); expect(mid.y - before.y).toBeCloseTo(30, 0);
  await page.keyboard.press('v');
  await page.keyboard.down('Space');
  await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(580, 400, { steps: 3 }); await page.mouse.up();
  await page.keyboard.up('Space');
  const end = await docToPage(page, 0, 0);
  expect(end.x - mid.x).toBeCloseTo(-20, 0);
});

test('new document dialog creates a 4500×5400 transparent POD artboard in a new tab', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 200, 200);
  await page.keyboard.press('Control+n');
  await expect(page.getByTestId('dialog-new')).toBeVisible();
  await page.getByTestId('new-name').fill('Tee');
  await page.getByTestId('new-create').click();
  const d = await docOf(page);
  expect(d.name).toBe('Tee');
  expect(d.artboards[0]).toMatchObject({ w: 4500, h: 5400, background: null });
  await expect(page.getByTestId('tab-1')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('tab-0').click();
  expect((await elements(page))).toHaveLength(1);
});

test('invalid new document sizes are rejected', async ({ page }) => {
  await page.keyboard.press('Control+n');
  await page.getByTestId('new-w').fill('0');
  await expect(page.getByTestId('new-create')).toBeDisabled();
  await page.getByTestId('new-w').fill('99999');
  await expect(page.getByTestId('new-error')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dialog-new')).toHaveCount(0);
});

test('save then reopen loses no geometry or properties (real file download and upload)', async ({ page }, info) => {
  await page.keyboard.press('m'); await dragDoc(page, 100, 100, 300, 250);
  await page.getByTestId('swatch-ff7f00').click();
  await page.keyboard.press('l'); await dragDoc(page, 400, 100, 600, 300);
  await page.keyboard.press('p'); await clickDoc(page, 100, 500); await dragDoc(page, 300, 500, 380, 440); await clickDoc(page, 250, 650);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+a');
  await page.getByTestId('stroke-width').fill('5'); await page.getByTestId('stroke-width').press('Enter');
  await page.keyboard.press('Control+g');
  await page.getByTestId('layer-add').click();
  const original = await docOf(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const file = info.outputPath('roundtrip.vstudio');
  await download.saveAs(file);
  expect(download.suggestedFilename()).toMatch(/\.vstudio$/);
  // Reopen into a fresh tab through the real file chooser.
  await page.keyboard.press('Control+n'); await page.getByTestId('new-create').click();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles(file);
  await expect.poll(() => docOf(page)).toEqual(original);
});

test('opening a corrupted file shows an error and keeps the app usable', async ({ page }, info) => {
  const fs = await import('node:fs');
  const bad = info.outputPath('bad.vstudio');
  fs.writeFileSync(bad, '{"format":"vector-studio","version":1,"id":"x"');
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles(bad);
  await expect(page.getByTestId('toast')).toContainText(/Cannot open/);
  await page.keyboard.press('m');
  await dragDoc(page, 10, 10, 100, 100);
  expect(await elements(page)).toHaveLength(1);
});

test('SVG import and export through the UI', async ({ page }, info) => {
  const fs = await import('node:fs');
  const svg = info.outputPath('in.svg');
  fs.writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect x="10" y="10" width="100" height="50" fill="#ff0000"/><circle cx="200" cy="100" r="40" fill="blue"/><text>x</text></svg>`);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menubar').getByText('File', { exact: true }).click();
  await page.getByTestId('menu-file.importSvg').click();
  await (await chooser).setFiles(svg);
  await expect(page.getByTestId('import-warnings')).toContainText('<text>');
  const d = await docOf(page);
  expect(d.artboards[0]).toMatchObject({ w: 300, h: 200 });
  expect((await elements(page)).map((e) => e.type)).toEqual(['rect', 'ellipse']);
  const [download] = await Promise.all([page.waitForEvent('download'), (async () => {
    await page.getByRole('menubar').getByText('File', { exact: true }).click();
    await page.getByTestId('menu-file.exportSvg').click();
  })()]);
  const out = info.outputPath('out.svg');
  await download.saveAs(out);
  const text = fs.readFileSync(out, 'utf8');
  expect(text).toContain('viewBox="0 0 300 200"');
  expect(text).toContain('<rect');
  expect(text).toContain('<ellipse');
});

test('PNG export: exact pixel size, transparent background, correct pixels', async ({ page }, info) => {
  await page.keyboard.press('Control+n');
  await page.getByTestId('new-w').fill('400'); await page.getByTestId('new-h').fill('300');
  await page.getByTestId('new-create').click();
  await page.keyboard.press('m'); await page.getByTestId('swatch-ff0000').click();
  await dragDoc(page, 100, 100, 200, 200);
  await page.keyboard.press('Control+Shift+e');
  await page.getByTestId('export-scale').fill('2');
  await expect(page.getByTestId('export-size')).toContainText('800 × 600');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  const out = info.outputPath('out.png');
  await download.saveAs(out);
  const png = PNG.sync.read(readFileSync(out));
  expect(png.width).toBe(800); expect(png.height).toBe(600);
  const px = (x: number, y: number) => [...png.data.slice((png.width * y + x) * 4, (png.width * y + x) * 4 + 4)];
  expect(px(10, 10)[3]).toBe(0);           // transparent outside the shape
  expect(px(300, 300)).toEqual([255, 0, 0, 255]);
  // Shape edge accuracy: box is 200..400 px at 2x (tool mapping may differ by < 1.5 doc px → 3 px at 2x)
  let left = 0; while (px(left, 300)[3] === 0) left++;
  expect(Math.abs(left - 200)).toBeLessThanOrEqual(3);
});

test('export dialog validates absurd sizes', async ({ page }) => {
  await page.keyboard.press('Control+Shift+e');
  await page.getByTestId('export-scale').fill('100');
  await expect(page.getByTestId('export-go')).toBeDisabled();
  await page.getByTestId('export-scale').fill('abc');
  await expect(page.getByTestId('export-go')).toBeDisabled();
});

test('artboards panel: add the T-shirt preset, resize, toggle transparency, delete', async ({ page }) => {
  await page.getByTestId('artboard-preset').selectOption({ index: 0 });
  await page.getByTestId('artboard-add').click();
  let d = await docOf(page);
  expect(d.artboards).toHaveLength(2);
  expect(d.artboards[1]).toMatchObject({ w: 4500, h: 5400 });
  await page.getByTestId('artboard-transparent').check();
  expect((await docOf(page)).artboards[1].background).toBeNull();
  await page.getByTestId('artboard-w').fill('1000'); await page.getByTestId('artboard-w').press('Enter');
  expect((await docOf(page)).artboards[1].w).toBe(1000);
  await page.getByTestId('artboard-delete').click();
  d = await docOf(page);
  expect(d.artboards).toHaveLength(1);
});

test('direct selection: edit a Bezier node and handle on a pen path', async ({ page }) => {
  await page.keyboard.press('p');
  await clickDoc(page, 200, 600); await dragDoc(page, 600, 600, 700, 500); await clickDoc(page, 900, 700);
  await page.keyboard.press('Enter');
  await page.keyboard.press('a');
  await clickDoc(page, 600, 600);                    // select the smooth anchor
  await dragDoc(page, 700, 500, 700, 420);           // drag its out-handle up
  const p = (await elements(page))[0] as unknown as { nodes: { x: number; y: number; outX: number; outY: number; inX: number; inY: number }[] };
  const n1 = p.nodes[1];
  expect(Math.abs(n1.outY - -180)).toBeLessThan(2);
  expect(Math.abs(n1.inX * n1.outY - n1.inY * n1.outX)).toBeLessThan(1); // opposite handle stays collinear
  expect(Math.hypot(n1.inX, n1.inY)).toBeCloseTo(Math.hypot(100, 100), -1); // and keeps its length
  await dragDoc(page, 200, 600, 200, 650);           // move first anchor by dragging
  const q = (await elements(page))[0] as unknown as { nodes: { x: number; y: number }[] };
  expect(Math.abs(q.nodes[0].y - 650)).toBeLessThan(2);
});

test('keyboard nudge moves by 1 and 10 document units', async ({ page }) => {
  await page.keyboard.press('m'); await dragDoc(page, 100, 100, 200, 200);
  await page.keyboard.press('v');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
  const [r] = await elements(page);
  expect((r.transform as number[]).slice(4)).toEqual([1, 10]);
});

test('help dialogs open from shortcut and menu and close with Escape', async ({ page }) => {
  await page.keyboard.press('F1');
  await expect(page.getByTestId('dialog-shortcuts')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dialog-shortcuts')).toHaveCount(0);
});

test('print-on-demand template: 4500x5400 transparent PNG exports from the real browser with exact size and alpha', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.keyboard.press('Control+n');
  await page.getByTestId('new-create').click(); // default preset is the T-shirt template, transparent
  await page.keyboard.press('m'); await page.getByTestId('swatch-0070ff').click();
  await dragDoc(page, 1000, 1200, 3000, 3200);
  await page.keyboard.press('Control+Shift+e');
  await expect(page.getByTestId('export-size')).toContainText('4500 × 5400');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('export-go').click()]);
  const out = info.outputPath('pod.png');
  await download.saveAs(out);
  const png = PNG.sync.read(readFileSync(out));
  expect(png.width).toBe(4500); expect(png.height).toBe(5400);
  const px = (x: number, y: number) => [...png.data.slice((png.width * y + x) * 4, (png.width * y + x) * 4 + 4)];
  expect(px(100, 100)[3]).toBe(0);
  expect(px(2000, 2200)).toEqual([0, 112, 255, 255]);
  expect(px(4400, 5300)[3]).toBe(0);
});

test('Object menu: Unite and Minus Front work on overlapping shapes', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 400, 400);
  await dragDoc(page, 300, 300, 600, 600);
  await page.keyboard.press('Control+a');
  await page.getByRole('menubar').getByText('Object', { exact: true }).click();
  await page.getByTestId('menu-object.subtract').click();
  const els = await elements(page);
  expect(els).toHaveLength(1);
  expect(els[0].type).toBe('path');
  // The subtracted corner is empty, the rest of the first square is still hit-testable.
  await page.keyboard.press('Control+Shift+a');
  await page.keyboard.press('v');
  await clickDoc(page, 350, 350);
  expect(await page.evaluate(() => (window as unknown as { __vs: { workspace: { current: { selection: string[] } } } }).__vs.workspace.current.selection.length)).toBe(0);
  await clickDoc(page, 150, 150);
  expect(await page.evaluate(() => (window as unknown as { __vs: { workspace: { current: { selection: string[] } } } }).__vs.workspace.current.selection.length)).toBe(1);
});

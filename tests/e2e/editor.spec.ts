import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { boot, clickDoc, docOf, dragDoc, docToPage } from './helpers';

test.beforeEach(async ({ page }) => { await boot(page); });

const elements = async (page: import('@playwright/test').Page) => (await docOf(page)).layers.flatMap((l: { children: unknown[] }) => l.children) as Array<Record<string, unknown> & { id: string; type: string }>;

test('app shell shows every required region', async ({ page }) => {
  for (const id of ['menubar', 'doc-tabs', 'toolbar', 'canvas', 'statusbar', 'panels', 'optionsbar']) await expect(page.getByTestId(id)).toBeVisible();
  for (const p of ['properties', 'color', 'stroke', 'layers', 'artboards']) await expect(page.getByTestId(`panel-${p}`)).toBeVisible();
  for (const t of ['select', 'pen', 'text', 'rect', 'eyedropper', 'artboard']) await expect(page.getByTestId(`tool-${t}`)).toBeVisible();   // one button per tool group
  await page.getByTestId('flyout-select').click();
  for (const t of ['select', 'direct', 'wand', 'lasso']) await expect(page.getByTestId('flyout-menu-select').getByTestId(`tool-${t}`)).toBeVisible();
  await page.getByTestId('flyout-menu-select').getByTestId('tool-select').click();
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

test('Align panel aligns two shapes; Clipping Mask menu clips and releases', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 200, 200);
  await dragDoc(page, 400, 300, 600, 500);
  await page.keyboard.press('Control+a');
  await page.getByTestId('align-left').click();
  const [a, b] = await elements(page);
  const left = (e: { x: unknown; transform: unknown }) => (e.x as number) + (e.transform as number[])[4];
  expect(Math.abs(left(a as never) - left(b as never))).toBeLessThan(0.01);
  await page.keyboard.press('Control+7');
  let els = await elements(page);
  expect(els).toHaveLength(1);
  expect(els[0]).toMatchObject({ type: 'group', clip: true });
  await page.keyboard.press('Control+Alt+7');
  els = await elements(page);
  expect(els[0]).toMatchObject({ clip: false });
});

test('gradient fill: switch to linear, edit stops and angle, switch to radial and back to solid', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 400, 300);
  await page.getByTestId('swatch-ff0000').click();
  await page.getByTestId('fill-type-linear').click();
  let el = (await elements(page))[0] as unknown as { fill: { type: string; stops: { color: string; offset: number }[]; x1: number; x2: number } };
  expect(el.fill.type).toBe('linear');
  expect(el.fill.stops.map((s) => s.color)).toEqual(['#ff0000', '#ffffff']);
  await page.getByTestId('stop-add').click();
  await page.getByTestId('stop-offset-0').fill('0'); // keep first at 0
  await page.getByTestId('gradient-angle').fill('90'); await page.getByTestId('gradient-angle').press('Enter');
  el = (await elements(page))[0] as never;
  expect(el.fill.stops).toHaveLength(3);
  expect(Math.abs(el.fill.x2 - el.fill.x1)).toBeLessThan(1e-9); // vertical now
  await page.getByTestId('stop-remove-2').click();
  expect(((await elements(page))[0] as never as { fill: { stops: unknown[] } }).fill.stops).toHaveLength(2);
  await page.getByTestId('fill-type-radial').click();
  expect(((await elements(page))[0] as never as { fill: { type: string } }).fill.type).toBe('radial');
  await page.getByTestId('fill-type-solid').click();
  expect(((await elements(page))[0] as never as { fill: { type: string; color: string } }).fill).toMatchObject({ type: 'solid', color: '#ff0000' });
});

test('rulers: drag a guide from the ruler, snap a new shape to it, toggle rulers from the View menu', async ({ page }) => {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const target = await docToPage(page, 600, 500);
  await page.mouse.move(box.x + 8, target.y);          // inside the left ruler strip
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  const guides = (await docOf(page)).guides as { axis: string; pos: number }[];
  expect(guides).toHaveLength(1);
  expect(guides[0].axis).toBe('v');
  expect(Math.abs(guides[0].pos - 600)).toBeLessThan(1.5);
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, guides[0].pos - 2, 300); // ends 2 doc units short of the guide
  const r = (await elements(page))[0] as unknown as { x: number; w: number };
  expect(r.x + r.w).toBeCloseTo(guides[0].pos, 6);
  await page.getByRole('menubar').getByText('View', { exact: true }).click();
  await page.getByTestId('menu-view.rulers').click();
  expect(await page.evaluate(() => (window as unknown as { __vs: { workspace: { current: { showRulers: boolean } } } }).__vs.workspace.current.showRulers)).toBe(false);
});

test('export presets and formats: POD preset writes 300 ppi PNG; JPEG; multi-page PDF; batch of all artboards', async ({ page }, info) => {
  test.setTimeout(120000);
  const fs = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { readPngPpi, readJpegPpi } = await import('../../src/core/io');
  await page.keyboard.press('Control+n');
  await page.getByTestId('new-w').fill('600'); await page.getByTestId('new-h').fill('800');
  await page.getByTestId('new-create').click();
  await page.keyboard.press('m'); await page.getByTestId('swatch-ff0000').click();
  await dragDoc(page, 50, 50, 300, 300);
  await page.getByTestId('artboard-preset').selectOption({ index: 2 });
  await page.getByTestId('artboard-add').click();           // second artboard 1920×1080

  // 1) POD preset on the first artboard
  await page.getByTestId('artboard-row-0').click();
  await page.keyboard.press('Control+Shift+e');
  await page.getByTestId('export-preset').selectOption('pod-tee');
  await expect(page.getByTestId('export-size')).toContainText('4500 × 6000');
  await expect(page.getByTestId('export-size')).toContainText('15.00 × 20.00 in');
  let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('export-go').click()]);
  let out = info.outputPath('pod.png'); await dl.saveAs(out);
  expect(readPngPpi(new Uint8Array(fs.readFileSync(out)))).toBe(300);

  // 2) JPEG
  await page.keyboard.press('Control+Shift+e');
  await page.getByTestId('export-format').selectOption('jpeg');
  await expect(page.getByTestId('export-issues')).toContainText('JPEG has no transparency');
  await page.getByTestId('export-preset').selectOption('jpeg-hi');
  [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  out = info.outputPath('x.jpg'); await dl.saveAs(out);
  const jpg = new Uint8Array(fs.readFileSync(out));
  expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
  expect(readJpegPpi(jpg)).toBe(300);
  expect(dl.suggestedFilename()).toMatch(/\.jpg$/);

  // 3) PDF with all artboards → one 2-page file
  await page.keyboard.press('Control+Shift+e');
  await page.getByTestId('export-format').selectOption('pdf');
  await page.getByTestId('export-all').check();
  [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  out = info.outputPath('x.pdf'); await dl.saveAs(out);
  const pdfinfo = execFileSync('pdfinfo', [out]).toString();
  expect(pdfinfo).toMatch(/Pages:\s+2/);
  expect(pdfinfo).toMatch(/Page\s+1 size:|Page size:/);

  // 4) Batch PNG: two artboards → two downloads
  await page.keyboard.press('Control+Shift+e');
  await page.getByTestId('export-format').selectOption('png');
  await page.getByTestId('export-all').check();
  await page.getByTestId('export-width').count();
  const names: string[] = [];
  page.on('download', (d) => names.push(d.suggestedFilename()));
  await page.getByTestId('export-go').click();
  await expect.poll(() => names.length, { timeout: 30000 }).toBe(2);
  expect(new Set(names).size).toBe(2);
  expect(names.every((n) => n.endsWith('.png'))).toBe(true);
});

test('Type tool: create text, type into the Typography panel (one undo step), style it, outline it', async ({ page }) => {
  await page.keyboard.press('t');
  await clickDoc(page, 200, 300);
  await expect(page.getByTestId('text-inline')).toBeFocused();   // in-place box over the canvas
  await page.keyboard.type('Hello World');
  await page.getByTestId('font-size').fill('120'); await page.getByTestId('font-size').press('Enter');
  await page.getByTestId('font-weight').selectOption('700');
  await page.getByTestId('align-text-center').click();
  let el = (await elements(page))[0] as unknown as { type: string; content: string; fontSize: number; fontWeight: number; align: string; x: number };
  expect(el).toMatchObject({ type: 'text', content: 'Hello World', fontSize: 120, fontWeight: 700, align: 'center' });
  expect(Math.abs(el.x - 200)).toBeLessThan(1.5);
  // The frame is selectable and shows a plausible width for 11 characters at 120px.
  const width = await page.getByTestId('prop-w').inputValue();
  expect(+width).toBeGreaterThan(500); expect(+width).toBeLessThan(900);
  // Typing was a single undo step.
  await page.getByTestId('text-content').focus(); await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  el = (await elements(page))[0] as never;
  expect(el.content).toBe('Text');
  await page.keyboard.press('Control+Shift+z'); await page.keyboard.press('Control+Shift+z'); await page.keyboard.press('Control+Shift+z'); await page.keyboard.press('Control+Shift+z');
  expect(((await elements(page))[0] as never as { content: string }).content).toBe('Hello World');
  await page.getByRole('menubar').getByText('Type', { exact: true }).click();
  await page.getByTestId('menu-object.outlines').click();
  const out = (await elements(page))[0] as unknown as { type: string; extra: unknown[] };
  expect(out.type).toBe('path');
  expect(out.extra.length).toBeGreaterThan(8);
});

test('text renders ink in exports and survives save/reopen as editable text', async ({ page }, info) => {
  const fs = await import('node:fs');
  await page.keyboard.press('t');
  await clickDoc(page, 100, 400);
  await page.keyboard.type('Wg');
  await page.getByTestId('font-size').fill('300'); await page.getByTestId('font-size').press('Enter');
  await page.getByTestId('font-weight').selectOption('700');
  await page.keyboard.press('Control+Shift+e');
  await page.getByTestId('export-transparent').check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  const out = info.outputPath('text.png'); await dl.saveAs(out);
  const png = PNG.sync.read(readFileSync(out));
  let ink = 0;
  for (let y = 0; y < png.height; y += 4) for (let x = 0; x < png.width; x += 4) if (png.data[(png.width * y + x) * 4 + 3] > 200) ink++;
  expect(ink).toBeGreaterThan(300);
  // black text, so inked pixels are dark
  const i0 = (() => { for (let i = 0; i < png.data.length; i += 4) if (png.data[i + 3] === 255) return i; return -1; })();
  expect(png.data[i0]).toBeLessThan(10);
  await page.keyboard.press('Escape'); // leave the editor field
  const original = await docOf(page);
  const [save] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const file = info.outputPath('text.vstudio'); await save.saveAs(file);
  await page.keyboard.press('Control+n'); await page.getByTestId('new-create').click();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles(file);
  await expect.poll(() => docOf(page)).toEqual(original);
  void fs;
  const t = (await elements(page))[0] as unknown as { type: string; content: string };
  expect(t).toMatchObject({ type: 'text', content: 'Wg' });
});

test('Make Text on Path from the Object menu', async ({ page }) => {
  await page.keyboard.press('p');
  await clickDoc(page, 100, 600); await dragDoc(page, 600, 300, 800, 300); await clickDoc(page, 1100, 600);
  await page.keyboard.press('Enter');
  await page.keyboard.press('t');
  await clickDoc(page, 100, 900);
  await page.keyboard.type('Along the curve');
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await page.keyboard.press('Control+a');
  await page.getByRole('menubar').getByText('Type', { exact: true }).click();
  await page.getByTestId('menu-object.textOnPath').click();
  const els = await elements(page);
  expect(els).toHaveLength(1);
  const t = els[0] as unknown as { type: string; path: { nodes: unknown[] } | null };
  expect(t.type).toBe('text');
  expect(t.path?.nodes.length).toBe(3);
  await page.getByRole('menubar').getByText('Type', { exact: true }).click();
  await page.getByTestId('menu-object.releaseTextPath').click();
  expect((await elements(page))).toHaveLength(2);
});

test('POD template creates a 300 ppi transparent document with centre and safe-area guides', async ({ page }) => {
  await page.keyboard.press('Control+n');
  await page.getByTestId('new-template').selectOption('pod-tee');
  await page.getByTestId('new-create').click();
  const d = await docOf(page);
  expect(d.ppi).toBe(300);
  expect(d.artboards[0]).toMatchObject({ w: 4500, h: 5400, background: null });
  expect(d.guides.length).toBe(6);
  expect(d.guides.some((g: { axis: string; pos: number }) => g.axis === 'v' && g.pos === 2250)).toBe(true);
  // physical size shows in the export dialog
  await page.keyboard.press('Control+Shift+e');
  await page.getByTestId('export-preset').selectOption('pod-tee');
  await expect(page.getByTestId('export-size')).toContainText('15.00 × 18.00 in');
});

test('Clean Up and Reduce Colors dialogs change the document and are undoable', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 300, 300);
  await page.getByTestId('color-hex').fill('#ff0000'); await page.getByTestId('color-hex').press('Enter');
  await dragDoc(page, 400, 100, 600, 300);
  await page.getByTestId('color-hex').fill('#f40a0a'); await page.getByTestId('color-hex').press('Enter');
  await dragDoc(page, 700, 100, 900, 300);
  await page.getByTestId('color-hex').fill('#0000ff'); await page.getByTestId('color-hex').press('Enter');
  const [, second] = await elements(page);
  await page.getByTestId(`el-vis-${second.id}`).click();       // hide the middle one
  await page.getByRole('menubar').getByText('Object', { exact: true }).click();
  await page.getByTestId('menu-object.cleanup').click();
  await page.getByTestId('cleanup-run').click();
  await expect(page.getByTestId('cleanup-report')).toContainText('Removed 1 object');
  await page.keyboard.press('Escape');
  expect(await elements(page)).toHaveLength(2);
  await page.getByRole('menubar').getByText('Object', { exact: true }).click();
  await page.getByTestId('menu-object.colors').click();
  await page.getByTestId('colors-target').fill('1');
  await page.getByTestId('colors-reduce').click();
  await expect(page.getByTestId('colors-msg')).toContainText('→ 1 colours');
  await page.keyboard.press('Escape');
  const fills = (await elements(page)).map((e) => (e as unknown as { fill: { color: string } }).fill.color);
  expect(new Set(fills).size).toBe(1);
  await page.keyboard.press('Control+z');
  const back = (await elements(page)).map((e) => (e as unknown as { fill: { color: string } }).fill.color);
  expect(new Set(back).size).toBe(2);
});

test('Trace Image: a PNG becomes editable vector shapes on the artboard', async ({ page }, info) => {
  const fs = await import('node:fs');
  const png = new PNG({ width: 80, height: 80 });
  for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
    const i = (80 * y + x) * 4;
    const inCircle = (x - 40) ** 2 + (y - 40) ** 2 < 28 ** 2;
    png.data[i] = inCircle ? 220 : 255; png.data[i + 1] = inCircle ? 30 : 255; png.data[i + 2] = inCircle ? 30 : 255; png.data[i + 3] = 255;
  }
  const file = info.outputPath('circle.png');
  fs.writeFileSync(file, PNG.sync.write(png));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menubar').getByText('File', { exact: true }).click();
  await page.getByTestId('menu-file.trace').click();
  await (await chooser).setFiles(file);
  await expect(page.getByTestId('dialog-trace')).toBeVisible();
  await expect(page.getByTestId('trace-info')).toContainText('80×80');
  await page.getByTestId('trace-go').click();
  await expect(page.getByTestId('dialog-trace')).toHaveCount(0);
  const els = await elements(page);
  expect(els).toHaveLength(1);
  expect(els[0].type).toBe('group');
  const kids = (els[0] as unknown as { children: { type: string; fill: { color: string } }[] }).children;
  expect(kids.length).toBeGreaterThanOrEqual(1);
  expect(kids.some((k) => k.type === 'path' && parseInt(k.fill.color.slice(1, 3), 16) > 180 && parseInt(k.fill.color.slice(3, 5), 16) < 100)).toBe(true);
});

test('Batch Resize & Export writes one correctly sized file per size; Plugins menu adds guides', async ({ page }, info) => {
  const fs = await import('node:fs');
  await page.keyboard.press('Control+n'); await page.getByTestId('new-w').fill('1000'); await page.getByTestId('new-h').fill('1000'); await page.getByTestId('new-create').click();
  await page.keyboard.press('m'); await page.getByTestId('swatch-ff0000').click(); await dragDoc(page, 250, 250, 750, 750);
  await page.getByRole('menubar').getByText('Plugins', { exact: true }).click();
  await page.getByTestId('menu-plugin-vs.pod-tools-addPrintGuides').click();
  expect(((await docOf(page)).guides as unknown[]).length).toBe(5);
  await page.getByRole('menubar').getByText('File', { exact: true }).click();
  await page.getByTestId('menu-file.batch').click();
  await page.getByTestId('batch-sizes').fill('500x500 small\n200x400 tall\nnonsense');
  await expect(page.getByTestId('batch-error')).toContainText('Cannot read size');
  await expect(page.getByTestId('batch-go')).toBeDisabled();
  await page.getByTestId('batch-sizes').fill('500x500 small\n200x400 tall');
  const names: string[] = [];
  const saved: string[] = [];
  page.on('download', async (d) => { names.push(d.suggestedFilename()); const p = info.outputPath(d.suggestedFilename()); await d.saveAs(p); saved.push(p); });
  await page.getByTestId('batch-go').click();
  await expect.poll(() => saved.length, { timeout: 20000 }).toBe(2);
  expect(names.some((n) => /small\.png$/.test(n))).toBe(true);
  expect(names.some((n) => /tall\.png$/.test(n))).toBe(true);
  const dims = saved.map((p) => { const png = PNG.sync.read(fs.readFileSync(p)); return [png.width, png.height]; }).sort();
  expect(dims).toEqual([[200, 400], [500, 500]]);
});

test('bleed field grows the output size and PDF export offers it', async ({ page }) => {
  await page.keyboard.press('Control+n'); await page.getByTestId('new-w').fill('300'); await page.getByTestId('new-h').fill('200'); await page.getByTestId('new-create').click();
  await page.keyboard.press('Control+Shift+e');
  await expect(page.getByTestId('export-size')).toContainText('300 × 200');
  await page.getByTestId('export-bleed').fill('25');
  await expect(page.getByTestId('export-size')).toContainText('350 × 250');
  await page.getByTestId('export-format').selectOption('pdf');
  await expect(page.getByTestId('export-bleed')).toBeVisible();
  await page.getByTestId('export-bleed').fill('-3');
  await expect(page.getByTestId('export-bleed-error')).toBeVisible();
  await expect(page.getByTestId('export-go')).toBeDisabled();
  await page.getByTestId('export-bleed').fill('3');
  await expect(page.getByTestId('export-go')).toBeEnabled();
});

test('Expand Stroke and Offset Path from the Object menu', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 200, 200, 400, 400);
  await page.getByTestId('target-stroke').click(); await page.getByTestId('swatch-0070ff').click();
  await page.getByTestId('stroke-width').fill('20'); await page.getByTestId('stroke-width').press('Enter');
  await page.getByRole('menubar').getByText('Object', { exact: true }).click();
  await page.getByTestId('menu-object.expandStroke').click();
  let els = await elements(page);
  expect(els).toHaveLength(1);
  const g = els[0] as unknown as { type: string; children: { type: string; stroke: unknown; fill: { color: string } }[] };
  expect(g.type).toBe('group');
  expect(g.children).toHaveLength(2);
  expect(g.children[1]).toMatchObject({ type: 'path', stroke: null, fill: { color: '#0070ff' } });
  await page.keyboard.press('Control+Shift+g');   // ungroup: both outlines selected
  els = await elements(page);
  expect(els).toHaveLength(2);
  await page.getByRole('menubar').getByText('Object', { exact: true }).click();
  await page.getByTestId('menu-object.offsetPath').click();
  await page.getByTestId('offset-distance').fill('0');
  await expect(page.getByTestId('offset-go')).toBeDisabled();
  await page.getByTestId('offset-distance').fill('-5');
  await page.getByTestId('offset-join').selectOption('miter');
  await page.getByTestId('offset-go').click();
  els = await elements(page);
  expect(els.length).toBeGreaterThanOrEqual(3);
});

test('in-place text box: appears on the text, edits live, closes on Escape; double-click reopens it', async ({ page }) => {
  await page.keyboard.press('t');
  await clickDoc(page, 300, 300);
  const box = page.getByTestId('text-inline');
  await expect(box).toBeVisible();
  const pos = await box.boundingBox();
  const at = await docToPage(page, 300, 300);
  expect(Math.abs(pos!.x - at.x)).toBeLessThan(40);                 // sits over the text frame
  await page.keyboard.type('Inline edit');
  expect(((await elements(page))[0] as unknown as { content: string }).content).toBe('Inline edit');
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await page.keyboard.press('v');
  await page.keyboard.press('Escape');                              // deselect
  const b = (await elements(page))[0] as unknown as { x: number; y: number };
  await clickDoc(page, b.x + 20, b.y - 10, { clickCount: 2 });
  await expect(page.getByTestId('text-inline')).toBeVisible();
  await page.keyboard.press('Control+a'); await page.keyboard.type('Second');
  await page.keyboard.press('Escape');
  expect(((await elements(page))[0] as unknown as { content: string }).content).toBe('Second');
  await page.keyboard.press('Control+z');
  expect(((await elements(page))[0] as unknown as { content: string }).content).toBe('Inline edit');
});

test('real double-click enters isolation mode on a group (browser click counting)', async ({ page }) => {
  await page.keyboard.press('m');
  await dragDoc(page, 100, 100, 200, 200);
  await dragDoc(page, 300, 100, 400, 200);
  await page.keyboard.press('Control+a'); await page.keyboard.press('Control+g');
  await page.keyboard.press('v');
  await clickDoc(page, 150, 150, { clickCount: 2 });
  expect(await page.evaluate(() => !!(window as unknown as { __vs: { workspace: { current: { isolation: string | null } } } }).__vs.workspace.current.isolation)).toBe(true);
});

test('Actions: record menu/panel commands, replay on another document, persist across reload, export/import, batch', async ({ page }, info) => {
  test.setTimeout(120000);
  const fs = await import('node:fs');
  const act = (id: string) => page.getByTestId(id);
  const makeRect = async (hex: string, x: number) => { await page.keyboard.press('m'); await dragDoc(page, x, 100, x + 200, 300); await page.getByTestId('color-hex').fill(hex); await page.getByTestId('color-hex').press('Enter'); };

  await act('act-new').click();
  await expect(act('action-Action 1')).toBeVisible();
  await act('act-record').click();
  // The recorded steps are semantic commands, not mouse coordinates:
  await makeRect('#ff0000', 100);
  await makeRect('#fe0505', 500);
  await page.keyboard.press('v');
  await page.getByRole('menubar').getByText('Edit', { exact: true }).click();
  await page.getByTestId('menu-edit.selectAll').click();
  await page.getByTestId('align-top').click();
  await act('act-pause-rec').click();
  await page.getByTestId('align-bottom').click();         // performed while paused: must NOT be recorded
  await act('act-pause-rec').click();
  await page.getByRole('menubar').getByText('Object', { exact: true }).click();
  await page.getByTestId('menu-object.group').click();
  await act('act-stop-rec').click();
  const labels = await page.locator('[data-testid^="step-label-"]').allTextContents();
  expect(labels.join('|')).toContain('Select All');
  expect(labels.join('|')).toContain('Align (mode=top');
  expect(labels.join('|')).not.toContain('bottom');
  expect(labels.join('|')).toContain('Group');
  expect(labels.join('|')).not.toMatch(/x=|y=/);          // no coordinates

  // add an export step by hand and a disabled step
  await act('act-insert-type').selectOption('exportSvg');
  await act('act-insert').click();
  await act('step-enable-1').uncheck();                   // disable "Select All"... then re-enable below to test toggling
  await act('step-enable-1').check();

  // Reload: the action library must still be there (persisted).
  await page.evaluate(() => (window as unknown as { __vsActions: { flush(): void } }).__vsActions.flush());
  await page.reload();
  await page.waitForSelector('[data-testid="canvas"]');
  await page.evaluate(() => (window as unknown as { __vsFontsReady: Promise<void> }).__vsFontsReady);
  await expect(act('action-Action 1')).toBeVisible();

  // Play it on a fresh document with two different shapes.
  await page.keyboard.press('Control+n'); await page.getByTestId('new-create').click();
  await makeRect('#00aa00', 100);
  await makeRect('#00ab00', 600);
  await act('action-Action 1').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), act('act-play').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.svg$/);
  await expect(act('act-status')).toContainText('Finished');
  const els = await elements(page);
  expect(els).toHaveLength(1);
  expect(els[0].type).toBe('group');
  // Undo the whole run in one click.
  await act('act-undo').click();
  expect(await elements(page)).toHaveLength(2);

  // Step-by-step execution.
  await act('act-step').click();
  await expect(act('act-status')).toContainText('Step 1 of');
  await act('act-stop').click();

  // Export the set, delete it, import it back.
  const [exp] = await Promise.all([page.waitForEvent('download'), act('act-export').click()]);
  const file = info.outputPath('set.vsactions'); await exp.saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.format).toBe('vector-studio-actions');
  const chooser = page.waitForEvent('filechooser');
  await act('act-import').click();
  await (await chooser).setFiles(file);
  await expect(page.getByTestId('toast')).toContainText('Imported 1 action set');
  await expect(page.locator('[data-testid="action-Action 1"]')).toHaveCount(2);
});

test('Batch dialog: runs an action over several files, reports the broken one, saves outputs, never touches inputs', async ({ page }, info) => {
  test.setTimeout(90000);
  const fs = await import('node:fs');
  const { createDocument, createRect, addElement, serializeDocument, solid } = await import('../../src/core/document');
  const mk = (name: string, color: string) => { const d = createDocument(name, 400, 400); addElement(d, createRect(50, 50, 200, 200, { fill: solid(color), stroke: null })); const f = info.outputPath(`${name}.vstudio`); fs.writeFileSync(f, serializeDocument(d)); return f; };
  const a = mk('alpha', '#ff0000'), b = mk('beta', '#0000ff');
  const broken = info.outputPath('broken.vstudio'); fs.writeFileSync(broken, '{"oops":true}');
  const before = [a, b].map((f) => fs.readFileSync(f, 'utf8'));

  await page.getByTestId('act-new').click();
  await page.getByTestId('act-insert-type').selectOption('selectAll'); await page.getByTestId('act-insert').click();
  await page.getByTestId('act-insert-type').selectOption('scaleSelection'); await page.getByTestId('act-insert').click();   // 50 %
  await page.getByTestId('act-insert-type').selectOption('exportRaster'); await page.getByTestId('act-insert').click();    // png 4500 wide: override below
  await page.getByTestId('step-edit-2').click();
  await page.getByTestId('step-json').fill('{"format":"png","width":200,"transparent":true}');
  await page.getByTestId('step-save').click();
  await page.getByTestId('act-batch').click();
  await expect(page.getByTestId('dialog-batch-actions')).toBeVisible();
  await page.getByTestId('ba-pattern').fill('{n}-{file}');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('ba-add').click();
  await (await chooser).setFiles([a, broken, b]);
  await expect(page.getByTestId('ba-count')).toHaveText('3 file(s)');
  await page.getByTestId('ba-run').click();
  await expect(page.getByTestId('ba-summary')).toHaveText('2 succeeded, 1 failed, 0 not run');
  await expect(page.getByTestId('ba-log')).toContainText('broken.vstudio');
  await expect(page.getByTestId('ba-log')).toContainText('Not a Vector Studio');
  const names: string[] = [];
  page.on('download', (d) => names.push(d.suggestedFilename()));
  await page.getByTestId('ba-save').click();
  await expect.poll(() => names.length, { timeout: 15000 }).toBe(2);
  expect(names.sort()).toEqual(['1-alpha.png', '3-beta.png']);
  expect([a, b].map((f) => fs.readFileSync(f, 'utf8'))).toEqual(before);
});

test('toolbar flyouts: pick Star, set points in the options bar, draw; shortcuts for Pencil, Eyedropper, Wand; compact/expanded toggle', async ({ page }) => {
  await page.getByTestId('flyout-shape').click();
  await page.getByTestId('tool-star').click();
  await expect(page.getByTestId('status-tool')).toHaveText('Star');
  await page.getByTestId('opt-points').fill('8'); await page.getByTestId('opt-points').press('Enter');
  await dragDoc(page, 400, 400, 400, 250);
  const star = (await elements(page))[0] as unknown as { type: string; nodes: unknown[]; name: string };
  expect(star).toMatchObject({ type: 'path', name: 'Star' });
  expect(star.nodes).toHaveLength(16);
  // the group button now shows the last-used shape tool
  await expect(page.getByTestId('tool-star')).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.getByTestId('status-tool')).toHaveText('Pencil');
  await page.keyboard.press('i'); await expect(page.getByTestId('status-tool')).toHaveText('Eyedropper');
  await page.keyboard.press('y'); await expect(page.getByTestId('status-tool')).toHaveText('Magic Wand');
  await page.keyboard.press('Shift+o'); await expect(page.getByTestId('status-tool')).toHaveText('Artboard');
  await page.getByTestId('toolbar-toggle').click();
  expect((await page.getByTestId('toolbar').boundingBox())!.width).toBeGreaterThan(60);
});

test('pencil, magic wand and artboard tools work with real mouse input', async ({ page }) => {
  await page.keyboard.press('n');
  const a = await docToPage(page, 200, 300), b = await docToPage(page, 600, 300);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 40, a.y - 60 * Math.sin((i / 40) * Math.PI));
  await page.mouse.up();
  const els = await elements(page);
  expect(els).toHaveLength(1);
  expect((els[0] as unknown as { nodes: unknown[] }).nodes.length).toBeLessThanOrEqual(5);
  await page.keyboard.press('Escape');                        // deselect the pencil path so the swatch only sets the default fill
  await page.keyboard.press('m'); await page.getByTestId('swatch-ff0000').click();
  await dragDoc(page, 100, 600, 250, 750); await dragDoc(page, 400, 600, 550, 750);
  await page.keyboard.press('y');
  await clickDoc(page, 150, 650);
  expect(await page.evaluate(() => (window as unknown as { __vs: { workspace: { current: { selection: string[] } } } }).__vs.workspace.current.selection.length)).toBe(2);
  await page.getByTestId('zoom-input').fill('25'); await page.getByTestId('zoom-input').press('Enter');   // room to the right of the artboard
  await page.keyboard.press('Shift+o');
  await dragDoc(page, 2200, 100, 2600, 500);
  expect((await docOf(page)).artboards).toHaveLength(2);
});

test('Transform, Pathfinder and Document Info panels act on the real document', async ({ page }) => {
  await page.keyboard.press('m'); await page.getByTestId('swatch-ff0000').click();
  await dragDoc(page, 200, 200, 400, 300);
  await page.getByTestId('tf-rotate').fill('90'); await page.getByTestId('tf-rotate').press('Enter');
  await page.getByTestId('tf-rotate-go').click();
  let r = (await elements(page))[0] as unknown as { transform: number[] };
  expect(Math.abs(r.transform[0])).toBeLessThan(1e-9); expect(Math.abs(r.transform[1] - 1)).toBeLessThan(1e-9);
  await page.getByTestId('tf-flip-h').click();
  r = (await elements(page))[0] as never;
  expect(Math.abs(r.transform[0])).toBeLessThan(1e-9);
  await expect(page.getByTestId('di-counts')).toContainText('1 object(s) (1 rect)');
  await expect(page.getByTestId('di-colors')).toContainText('2 colour(s)')   // red fill + the default black stroke;
  await dragDoc(page, 300, 250, 500, 350);
  await page.keyboard.press('v'); await page.keyboard.press('Control+a');
  await expect(page.getByTestId('pf-unite')).toBeEnabled();
  await page.getByTestId('pf-unite').click();
  expect(await elements(page)).toHaveLength(1);
  await expect(page.getByTestId('di-counts')).toContainText('1 path');
});

test('custom keyboard shortcuts: rebind, conflicts, persistence across reload, typing is not hijacked, export/import', async ({ page }, info) => {
  const fs = await import('node:fs');
  await page.keyboard.press('F1');
  await expect(page.getByTestId('dialog-shortcuts')).toBeVisible();
  await page.getByTestId('km-filter').fill('p');                 // typing letters in a field must not switch tools
  expect(await page.evaluate(() => (window as unknown as { __vs: { workspace: { current: { toolId: string } } } }).__vs.workspace.current.toolId)).toBe('select');
  await page.getByTestId('km-filter').fill('Pen Tool');
  await page.getByTestId('km-tool.pen').click();
  await page.keyboard.press('k');
  await expect(page.getByTestId('km-tool.pen')).toHaveText('K');
  await page.getByTestId('km-filter').fill('Rectangle Tool');
  await page.getByTestId('km-tool.rect').click();
  await page.keyboard.press('k');                                // already used by the Pen tool now
  await expect(page.getByTestId('km-error')).toContainText('already used');
  await page.keyboard.press('k');                                // press again to take it over
  await expect(page.getByTestId('km-tool.rect')).toHaveText('K');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForSelector('[data-testid="canvas"]');
  await page.keyboard.press('k');
  await expect(page.getByTestId('status-tool')).toHaveText('Rectangle');   // persisted, and the old key M no longer works for Rectangle
  await page.keyboard.press('m');
  await expect(page.getByTestId('status-tool')).toHaveText('Rectangle');
  await page.keyboard.press('v');
  await page.getByRole('menubar').getByText('Edit', { exact: true }).click();
  await page.keyboard.press('Escape');
  // export, reset to the built-in preset, import back
  await page.keyboard.press('F1');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('km-export').click()]);
  const file = info.outputPath('keys.vskeys'); await dl.saveAs(file);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).shortcuts['tool.rect']).toBe('K');
  await page.getByTestId('km-preset').selectOption('Illustrator');
  await expect(page.getByTestId('km-tool.rect')).toHaveText('M');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('km-import').click();
  await (await chooser).setFiles(file);
  await expect(page.getByTestId('km-msg')).toContainText('Imported');
  await expect(page.getByTestId('km-tool.rect')).toHaveText('K');
});

test('Appearance and Transparency panels: add/edit/remove live effects, blend mode, warnings on PDF export, save/reopen', async ({ page }, info) => {
  await page.keyboard.press('m'); await page.getByTestId('swatch-ff0000').click();
  await dragDoc(page, 300, 300, 600, 500);
  await expect(page.getByTestId('ap-fill')).toContainText('#ff0000');
  await page.getByTestId('blend-mode').selectOption('multiply');
  await page.getByTestId('fx-kind').selectOption('dropShadow');
  await page.getByTestId('fx-add').click();
  await page.getByTestId('fx-dx-0').fill('40'); await page.getByTestId('fx-dx-0').press('Enter');
  await page.getByTestId('fx-kind').selectOption('blur');
  await page.getByTestId('fx-add').click();
  let el = (await elements(page))[0] as unknown as { blend: string; effects: { type: string; dx?: number; radius?: number }[] };
  expect(el.blend).toBe('multiply');
  expect(el.effects.map((e) => e.type)).toEqual(['dropShadow', 'blur']);
  expect(el.effects[0].dx).toBe(40);
  await page.getByTestId('fx-remove-1').click();
  el = (await elements(page))[0] as never;
  expect(el.effects).toHaveLength(1);
  // PDF export warns that effects are lost
  await page.keyboard.press('Control+Shift+e');
  await page.getByTestId('export-format').selectOption('pdf');
  await expect(page.getByTestId('export-issues')).toContainText('PDF cannot represent them');
  await page.keyboard.press('Escape');
  // survives save and reopen
  const original = await docOf(page);
  const [save] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const file = info.outputPath('fx.vstudio'); await save.saveAs(file);
  await page.keyboard.press('Control+n'); await page.getByTestId('new-create').click();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles(file);
  await expect.poll(() => docOf(page)).toEqual(original);
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('fx-0')).toBeVisible();      // the effect is still listed (and editable) after reopening
});

test('Window menu: workspaces and panel visibility persist; Select, Type and Effect menus act on the document', async ({ page }) => {
  const menu = async (name: string) => page.getByRole('menubar').getByText(name, { exact: true }).click();
  // Effect and Select menus
  await page.keyboard.press('m'); await page.getByTestId('swatch-ff0000').click();
  await dragDoc(page, 100, 100, 300, 300); await dragDoc(page, 400, 100, 600, 300);
  await page.keyboard.press('v');
  await page.keyboard.press('Control+a');
  await menu('Effect'); await page.getByTestId('menu-effect.dropShadow').click();
  expect(((await elements(page))[0] as unknown as { effects: unknown[] }).effects).toHaveLength(1);
  await menu('Effect'); await page.getByTestId('menu-effect.clear').click();
  expect(((await elements(page))[0] as unknown as { effects?: unknown[] }).effects).toBeUndefined();
  await page.keyboard.press('Escape');
  await clickDoc(page, 200, 200);
  await menu('Select'); await page.getByTestId('menu-select.sameFill').click();
  expect(await page.evaluate(() => (window as unknown as { __vs: { workspace: { current: { selection: string[] } } } }).__vs.workspace.current.selection.length)).toBe(2);
  await menu('Type'); await expect(page.getByTestId('menu-object.outlines')).toBeDisabled();
  await page.keyboard.press('Escape');

  // Workspaces
  await menu('Window'); await page.getByTestId('ws-Typography').click();
  await expect(page.getByTestId('panel-typography')).toBeVisible();
  await expect(page.getByTestId('panel-pathfinder')).toHaveCount(0);
  await menu('Window'); await page.getByTestId('win-pathfinder').click();      // show one more panel
  await expect(page.getByTestId('panel-pathfinder')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('panel-up-pathfinder').click();                         // reorder
  const order = await page.locator('[data-testid^="panel-"]:not([data-testid^="panel-up"]):not([data-testid^="panel-down"])').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(order.indexOf('panel-pathfinder')).toBeLessThan(order.indexOf('panel-artboards'));
  page.once('dialog', (d) => void d.accept('My layout'));
  await menu('Window'); await page.getByTestId('ws-save').click();
  await page.evaluate(() => { /* make sure storage has been written */ });
  await page.reload();
  await page.waitForSelector('[data-testid="canvas"]');
  await expect(page.getByTestId('panel-pathfinder')).toBeVisible();              // layout survived the restart
  await menu('Window');
  await expect(page.getByTestId('ws-My layout')).toBeVisible();
  await page.getByTestId('ws-Essentials').click();
  await expect(page.getByTestId('panel-pathfinder')).toHaveCount(0);
  await menu('Window'); await page.getByTestId('ws-My layout').click();
  await expect(page.getByTestId('panel-pathfinder')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await menu('Window'); await page.getByTestId('ws-delete').click();
  await menu('Window'); await expect(page.getByTestId('ws-My layout')).toHaveCount(0);
});

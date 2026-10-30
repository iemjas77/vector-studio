import type { Page } from '@playwright/test';
import type { Workspace } from '../../src/ui/workspace';

export interface VsWindow { __vs: { workspace: Workspace } }

export async function boot(page: Page) {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/');
  await page.waitForSelector('[data-testid="canvas"]');
  await page.waitForFunction(() => !!(window as unknown as VsWindow).__vs && !!(window as unknown as { __vsFontsReady?: Promise<void> }).__vsFontsReady);
  await page.evaluate(() => (window as unknown as { __vsFontsReady: Promise<void> }).__vsFontsReady);
}

/** Reads the active document from the running app (read-only inspection). */
export function docOf(page: Page) {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as VsWindow).__vs.workspace.current.doc)));
}

export function viewOf(page: Page) {
  return page.evaluate(() => { const v = (window as unknown as VsWindow).__vs.workspace.current.viewport; return { zoom: v.zoom, panX: v.panX, panY: v.panY }; });
}

/** Maps document coordinates to page coordinates using the live viewport. */
export async function docToPage(page: Page, x: number, y: number) {
  const v = await viewOf(page);
  const box = (await page.locator('[data-testid="canvas"]').boundingBox())!;
  return { x: box.x + x * v.zoom + v.panX, y: box.y + y * v.zoom + v.panY };
}

export async function dragDoc(page: Page, x1: number, y1: number, x2: number, y2: number, opts: { shift?: boolean; alt?: boolean } = {}) {
  const a = await docToPage(page, x1, y1), b = await docToPage(page, x2, y2);
  if (opts.shift) await page.keyboard.down('Shift');
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
  if (opts.shift) await page.keyboard.up('Shift');
}

export async function clickDoc(page: Page, x: number, y: number, opts: { shift?: boolean; clickCount?: number } = {}) {
  const a = await docToPage(page, x, y);
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.click(a.x, a.y, { clickCount: opts.clickCount ?? 1 });
  if (opts.shift) await page.keyboard.up('Shift');
}

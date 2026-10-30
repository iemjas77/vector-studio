import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { readFontInfo, listFonts, readFont } = require('../../electron/fonts.cjs') as {
  readFontInfo(f: string): { family: string; style: string; weight: number; italic: boolean } | null;
  listFonts(): { key: string; family: string; weight: number; italic: boolean }[];
  readFont(k: string): Buffer;
};
const bold = '/usr/share/fonts/opentype/inter/Inter-Bold.otf';
const d = existsSync(bold) ? describe : describe.skip;

d('system font discovery (Electron main process)', () => {
  it('reads family, weight and italic from font tables', () => {
    expect(readFontInfo(bold)).toMatchObject({ family: 'Inter', weight: 700, italic: false });
    expect(readFontInfo('/usr/share/fonts/opentype/inter/Inter-Italic.otf')).toMatchObject({ italic: true });
  });
  it('rejects non-font files and missing files without throwing', () => {
    expect(readFontInfo('/etc/hostname')).toBeNull();
    expect(readFontInfo('/no/such/file.ttf')).toBeNull();
  });
  it('lists fonts and only serves files it listed', () => {
    const list = listFonts();
    expect(list.length).toBeGreaterThan(0);
    expect(readFont(list[0].key).length).toBeGreaterThan(1000);
    expect(() => readFont('99999999')).toThrow(/Unknown font/);
    expect(() => readFont('../../etc/passwd')).toThrow(/Unknown font/);
  });
});

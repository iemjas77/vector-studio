import { existsSync, readFileSync } from 'node:fs';
import { fonts } from '../../src/core/text';

const f = (p: string) => new Uint8Array(readFileSync(p));
const ROOT = new URL('../../src/assets/fonts/', import.meta.url).pathname;

/** Registers the bundled Inter faces (always) and any system fonts available for multilingual tests. */
export function setupFonts(): { arabic: boolean; cjk: boolean } {
  fonts.register({ family: 'Inter', weight: 400, italic: false }, f(ROOT + 'Inter-Regular.otf'));
  fonts.register({ family: 'Inter', weight: 700, italic: false }, f(ROOT + 'Inter-Bold.otf'));
  const dejavu = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const arabic = existsSync(dejavu);
  if (arabic) fonts.register({ family: 'DejaVu Sans', weight: 400, italic: false }, f(dejavu));
  const uni = '/usr/share/fonts/opentype/unifont/unifont_jp.otf';
  const cjk = existsSync(uni);
  if (cjk) fonts.register({ family: 'Unifont JP', weight: 400, italic: false }, f(uni));
  fonts.fallbackFamilies = [...(arabic ? ['DejaVu Sans'] : []), ...(cjk ? ['Unifont JP'] : [])];
  return { arabic, cjk };
}

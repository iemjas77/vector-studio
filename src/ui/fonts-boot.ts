import { fonts, type FontDescriptor, type FontSource } from '../core/text';
import { platform } from '../platform';

const b64ToBytes = (dataUrl: string): Uint8Array => {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Families tried, in order, for characters the chosen font lacks (Latin fonts rarely cover Arabic, CJK, Indic…). */
export const FALLBACK_PREFERENCE = [
  'Segoe UI', 'Segoe UI Symbol', 'Microsoft YaHei', 'Microsoft JhengHei', 'Yu Gothic', 'Malgun Gothic', 'Nirmala UI',
  'Arial Unicode MS', 'Noto Sans', 'Noto Sans CJK JP', 'Noto Sans Arabic', 'Noto Sans Hebrew', 'DejaVu Sans', 'Arial',
];

/** Browser Local Font Access (Chromium). Needs a user permission, so it is optional and failures are ignored. */
function localFontAccessSource(): FontSource | null {
  const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string; style: string; blob(): Promise<Blob> }[]> }).queryLocalFonts;
  if (typeof q !== 'function') return null;
  let all: Awaited<ReturnType<NonNullable<typeof q>>> | null = null;
  return {
    async list() {
      all ??= await q.call(window);
      return all.map((f, i) => ({
        key: String(i), family: f.family,
        weight: /thin/i.test(f.style) ? 100 : /extra ?light/i.test(f.style) ? 200 : /light/i.test(f.style) ? 300 : /medium/i.test(f.style) ? 500 : /semi ?bold|demi/i.test(f.style) ? 600 : /extra ?bold|heavy/i.test(f.style) ? 800 : /black/i.test(f.style) ? 900 : /bold/i.test(f.style) ? 700 : 400,
        italic: /italic|oblique/i.test(f.style),
      }));
    },
    async load(key) { return new Uint8Array(await (await all![+key].blob()).arrayBuffer()); },
  };
}

let booted: Promise<void> | null = null;

/** Loads the bundled default font and discovers system fonts. Resolves when text can be laid out; `onChange` fires when more fonts arrive. */
export function bootFonts(onChange: () => void): Promise<void> {
  if (booted) return booted;
  booted = (async () => {
    const [reg, bold] = await Promise.all([
      import('../assets/fonts/Inter-Regular.otf?inline'),
      import('../assets/fonts/Inter-Bold.otf?inline'),
    ]);
    fonts.register({ family: 'Inter', weight: 400, italic: false }, b64ToBytes(reg.default));
    fonts.register({ family: 'Inter', weight: 700, italic: false }, b64ToBytes(bold.default));
    onChange();
    const src = platform.fontSource ?? localFontAccessSource();
    if (!src) return;
    let fallbackLoading = false;
    fonts.onMissingGlyphs = () => {
      if (fallbackLoading) return;
      fallbackLoading = true;
      const want: FontDescriptor[] = FALLBACK_PREFERENCE.map((family) => ({ family, weight: 400, italic: false }));
      void fonts.ensure(want).then((changed) => {
        fonts.fallbackFamilies = FALLBACK_PREFERENCE.filter((f) => fonts.faces.some((x) => x.family.toLowerCase() === f.toLowerCase()));
        if (changed) { fonts.version++; onChange(); }
      });
    };
    try { await fonts.addSource(src); onChange(); } catch { /* permission denied or unsupported: bundled font only */ }
  })();
  return booted;
}

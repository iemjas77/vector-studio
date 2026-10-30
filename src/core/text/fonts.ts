import * as hb from 'harfbuzzjs';
import { parsePathData } from '../io/svg-path';
import type { Subpath } from '../document/types';

/**
 * Font registry. Text is shaped with HarfBuzz and drawn as outlines, so every renderer/exporter gets identical glyphs.
 * Fonts come from (1) the bundled default, (2) providers (system fonts through Electron / Local Font Access).
 */

export interface FontDescriptor {
  family: string;
  /** 100..900 */
  weight: number;
  italic: boolean;
}

export interface LoadedFace extends FontDescriptor {
  id: number;
  font: hb.Font;
  face: hb.Face;
  upem: number;
  ascender: number; // font units, positive up
  descender: number; // font units, negative down
  glyphCache: Map<number, Subpath[]>;
}

/** A source of fonts that are not bundled (system fonts). */
export interface FontSource {
  list(): Promise<(FontDescriptor & { key: string })[]>;
  load(key: string): Promise<Uint8Array>;
}

const norm = (s: string) => s.trim().toLowerCase();

export class FontRegistry {
  faces: LoadedFace[] = [];
  /** Increments whenever a face is added; layouts are cached against it. */
  version = 0;
  defaultFamily = 'Inter';
  /** Families tried (in order) for glyphs the requested font lacks. */
  fallbackFamilies: string[] = [];
  private sources: FontSource[] = [];
  private catalog: { src: FontSource; info: FontDescriptor & { key: string } }[] = [];
  private loading = new Map<string, Promise<LoadedFace | null>>();
  private nextId = 1;

  register(desc: FontDescriptor, bytes: Uint8Array): LoadedFace {
    const existing = this.faces.find((f) => norm(f.family) === norm(desc.family) && f.weight === desc.weight && f.italic === desc.italic);
    if (existing) return existing;
    const copy = new Uint8Array(bytes); // own the buffer (hb copies it, but callers may reuse theirs)
    const blob = new hb.Blob(copy.buffer as ArrayBuffer);
    const face = new hb.Face(blob);
    const font = new hb.Font(face);
    const ext = font.hExtents();
    const loaded: LoadedFace = { ...desc, id: this.nextId++, font, face, upem: face.upem, ascender: ext.ascender, descender: ext.descender, glyphCache: new Map() };
    this.faces.push(loaded);
    this.version++;
    return loaded;
  }

  async addSource(src: FontSource): Promise<void> {
    this.sources.push(src);
    const list = await src.list();
    for (const info of list) this.catalog.push({ src, info });
    this.version++;
  }

  /** Family names offered to the user: loaded + discoverable. */
  families(): string[] {
    const set = new Set<string>();
    for (const f of this.faces) set.add(f.family);
    for (const c of this.catalog) set.add(c.info.family);
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  private score(f: FontDescriptor, want: FontDescriptor): number {
    return Math.abs(f.weight - want.weight) + (f.italic === want.italic ? 0 : 150);
  }

  /** Best loaded face for the request (same family if possible, else the default family, else anything). */
  resolve(want: FontDescriptor): LoadedFace | null {
    const pick = (family: string) => {
      const c = this.faces.filter((f) => norm(f.family) === norm(family));
      return c.length ? c.reduce((a, b) => (this.score(a, want) <= this.score(b, want) ? a : b)) : null;
    };
    return pick(want.family) ?? pick(this.defaultFamily) ?? this.faces[0] ?? null;
  }

  /** Make sure the faces needed for these requests are loaded. Resolves true if anything new was loaded (re-render needed). */
  async ensure(requests: FontDescriptor[]): Promise<boolean> {
    const before = this.faces.length;
    await Promise.all(requests.map((r) => this.ensureOne(r)));
    return this.faces.length !== before;
  }

  private async ensureOne(want: FontDescriptor): Promise<void> {
    const cands = this.catalog.filter((c) => norm(c.info.family) === norm(want.family));
    if (cands.length === 0) return;
    const best = cands.reduce((a, b) => (this.score(a.info, want) <= this.score(b.info, want) ? a : b));
    const have = this.faces.find((f) => norm(f.family) === norm(best.info.family) && f.weight === best.info.weight && f.italic === best.info.italic);
    if (have) return;
    const key = `${best.info.family}|${best.info.key}`;
    let p = this.loading.get(key);
    if (!p) {
      p = best.src.load(best.info.key).then((bytes) => this.register(best.info, bytes)).catch(() => null);
      this.loading.set(key, p);
    }
    await p;
  }

  /** Faces to try for missing glyphs, after the primary: configured fallbacks, then any loaded face. */
  fallbacksFor(primary: LoadedFace): LoadedFace[] {
    const out: LoadedFace[] = [];
    const add = (f: LoadedFace | null | undefined) => { if (f && f !== primary && !out.includes(f)) out.push(f); };
    for (const fam of this.fallbackFamilies) add(this.resolve({ family: fam, weight: primary.weight, italic: primary.italic }));
    for (const f of this.faces) add(f);
    return out;
  }

  /** Glyph outline (font units, y up) as subpaths; cached per face. */
  glyphOutline(face: LoadedFace, gid: number): Subpath[] {
    let c = face.glyphCache.get(gid);
    if (!c) {
      const d = face.font.glyphToPath(gid);
      c = d ? parsePathData(d).map((s) => ({ nodes: s.nodes, closed: true })) : [];
      face.glyphCache.set(gid, c);
    }
    return c;
  }
}

export const fonts = new FontRegistry();

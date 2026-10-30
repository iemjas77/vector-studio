/** Shortcut strings look like "Ctrl+Shift+Z": modifiers in the fixed order Ctrl, Alt, Shift, then one key. */

const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Semicolon: ';', Backslash: '\\', Comma: ',', Period: '.', Slash: '/', Quote: "'", Backquote: '`',
  Delete: 'Delete', Backspace: 'Backspace', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', Space: 'Space',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
};

export interface KeyEventLike { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }

/** Canonical shortcut for a key event, or null for a lone modifier. */
export function eventToShortcut(e: KeyEventLike): string | null {
  let key: string | undefined;
  const code = e.code ?? '';
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (CODE_KEYS[code]) key = CODE_KEYS[code];
  else if (!code) {
    const k = e.key;
    key = k.length === 1 ? k.toUpperCase() : /^F\d{1,2}$/.test(k) ? k : { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }[k] ?? k;
  }
  if (!key || ['Control', 'Shift', 'Alt', 'Meta'].includes(key) || /^(Control|Shift|Alt|Meta)/.test(code)) return null;
  let shift = e.shiftKey;
  if (key === '=' && shift) { key = '+'; shift = false; }       // "Ctrl++" is how zoom-in is written
  return [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', shift && 'Shift', key].filter(Boolean).join('+');
}

/** Normalises user-typed shortcuts ("ctrl+shift+z", "shift+ctrl+Z") to the canonical form. */
export function normalizeShortcut(s: string): string {
  const trailingPlus = s.endsWith('++') || s === '+';
  const parts = (trailingPlus ? s.slice(0, -1) : s).split('+').map((p) => p.trim()).filter(Boolean);
  const key = trailingPlus ? '+' : parts.pop() ?? '';
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const k = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
  return [(mods.has('ctrl') || mods.has('cmd') || mods.has('meta')) && 'Ctrl', mods.has('alt') && 'Alt', mods.has('shift') && 'Shift', k].filter(Boolean).join('+');
}

export interface KeymapPreset { name: string; overrides: Record<string, string> }
const LS = 'vs.keymap.v1';

/**
 * Effective shortcuts = built-in defaults (the Illustrator-style preset, defined with the commands) + the active preset's
 * overrides. An override of "" removes a shortcut. Pure logic; persistence goes through localStorage only when available.
 */
export class Keymap {
  private defaults = new Map<string, string>();
  presets: KeymapPreset[] = [];
  active = 'Illustrator';
  version = 0;
  private byKey = new Map<string, string>();
  private listeners = new Set<() => void>();

  constructor(defaults: { id: string; shortcut?: string }[], private storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    for (const d of defaults) if (d.shortcut) this.defaults.set(d.id, normalizeShortcut(d.shortcut));
    this.load();
    this.rebuild();
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  private get overrides(): Record<string, string> { return this.presets.find((p) => p.name === this.active)?.overrides ?? {}; }
  get(id: string): string | undefined {
    const o = this.overrides;
    if (id in o) return o[id] || undefined;
    return this.defaults.get(id);
  }
  isCustom(id: string) { return id in this.overrides; }
  commandFor(shortcut: string): string | undefined { return this.byKey.get(normalizeShortcut(shortcut)); }
  /** Which command already uses this shortcut (other than `exceptId`). */
  conflict(shortcut: string, exceptId?: string): string | undefined {
    const id = this.byKey.get(normalizeShortcut(shortcut));
    return id && id !== exceptId ? id : undefined;
  }

  private rebuild() {
    this.byKey.clear();
    const ids = new Set([...this.defaults.keys(), ...Object.keys(this.overrides)]);
    for (const id of ids) {
      const s = this.get(id);
      if (s) this.byKey.set(s, id);
    }
    this.version++;
    this.listeners.forEach((l) => l());
  }
  private editable(): KeymapPreset {
    let p = this.presets.find((x) => x.name === this.active);
    if (!p) { p = { name: this.active, overrides: {} }; this.presets.push(p); }
    return p;
  }
  /** Built-in "Illustrator" preset is read-only: editing it forks "Custom". */
  private ensureCustom() {
    if (this.active === 'Illustrator') {
      if (!this.presets.some((p) => p.name === 'Custom')) this.presets.push({ name: 'Custom', overrides: {} });
      this.active = 'Custom';
    }
  }
  /** Assign (or clear with "") a shortcut. Throws if another command owns it unless `steal` is set. */
  set(id: string, shortcut: string, steal = false): void {
    this.ensureCustom();
    const s = shortcut ? normalizeShortcut(shortcut) : '';
    if (s) {
      const other = this.conflict(s, id);
      if (other && !steal) throw new Error(`${s} is already used by "${other}"`);
      if (other) this.editable().overrides[other] = '';
    }
    this.editable().overrides[id] = s;
    this.save(); this.rebuild();
  }
  reset(id: string) { delete this.editable().overrides[id]; this.save(); this.rebuild(); }
  resetAll() { if (this.active !== 'Illustrator') this.editable().overrides = {}; this.save(); this.rebuild(); }
  selectPreset(name: string) {
    if (name !== 'Illustrator' && !this.presets.some((p) => p.name === name)) throw new Error(`Unknown preset "${name}"`);
    this.active = name; this.save(); this.rebuild();
  }
  saveAs(name: string) {
    const n = name.trim();
    if (!n || n === 'Illustrator') throw new Error('Choose a different preset name');
    const copy = structuredClone(this.overrides);
    const existing = this.presets.find((p) => p.name === n);
    if (existing) existing.overrides = copy; else this.presets.push({ name: n, overrides: copy });
    this.active = n; this.save(); this.rebuild();
  }
  deletePreset(name: string) {
    this.presets = this.presets.filter((p) => p.name !== name);
    if (this.active === name) this.active = 'Illustrator';
    this.save(); this.rebuild();
  }
  toJSON(): string { return JSON.stringify({ format: 'vector-studio-shortcuts', version: 1, name: this.active, shortcuts: Object.fromEntries([...new Set([...this.defaults.keys(), ...Object.keys(this.overrides)])].map((id) => [id, this.get(id) ?? ''])) }, null, 1); }
  /** Import a shortcut file as a new preset. Unknown command ids are reported, not silently dropped. */
  importJSON(text: string, knownIds: Set<string>): { name: string; ignored: string[] } {
    let data: { format?: string; name?: string; shortcuts?: Record<string, unknown> };
    try { data = JSON.parse(text); } catch { throw new Error('Not valid JSON'); }
    if (data.format !== 'vector-studio-shortcuts' || !data.shortcuts || typeof data.shortcuts !== 'object') throw new Error('Not a shortcut preset file');
    const overrides: Record<string, string> = {};
    const ignored: string[] = [];
    const seen = new Map<string, string>();
    for (const [id, v] of Object.entries(data.shortcuts)) {
      if (typeof v !== 'string') throw new Error(`Shortcut for "${id}" must be text`);
      if (!knownIds.has(id)) { ignored.push(id); continue; }
      const s = v ? normalizeShortcut(v) : '';
      if (s && seen.has(s)) throw new Error(`${s} is assigned to both "${seen.get(s)}" and "${id}"`);
      if (s) seen.set(s, id);
      if ((this.defaults.get(id) ?? '') !== s) overrides[id] = s;
    }
    let name = (data.name && data.name !== 'Illustrator' ? data.name : 'Imported').slice(0, 40);
    while (this.presets.some((p) => p.name === name)) name += ' (2)';
    this.presets.push({ name, overrides });
    this.active = name; this.save(); this.rebuild();
    return { name, ignored };
  }

  private save() { try { this.storage?.setItem(LS, JSON.stringify({ active: this.active, presets: this.presets })); } catch { /* storage unavailable */ } }
  private load() {
    try {
      const raw = this.storage?.getItem(LS);
      if (!raw) return;
      const d = JSON.parse(raw) as { active?: string; presets?: KeymapPreset[] };
      this.presets = (d.presets ?? []).filter((p) => p && typeof p.name === 'string' && p.overrides && typeof p.overrides === 'object');
      this.active = d.active && (d.active === 'Illustrator' || this.presets.some((p) => p.name === d.active)) ? d.active : 'Illustrator';
    } catch { this.presets = []; this.active = 'Illustrator'; }
  }
}

export interface PanelDef { id: string; title: string }

export interface WorkspacePreset {
  name: string;
  /** Panels shown, in order (top to bottom). */
  panels: string[];
  /** Panels shown but collapsed. */
  collapsed: string[];
}

/** Ids must match the panel list in App.tsx. */
export const ALL_PANELS: string[] = ['properties', 'appearance', 'transparency', 'color', 'stroke', 'typography', 'pathfinder', 'transform', 'align', 'docinfo', 'actions', 'layers', 'artboards'];

const P = (name: string, panels: string[], collapsed: string[] = []): WorkspacePreset => ({ name, panels, collapsed });

export const BUILTIN_WORKSPACES: WorkspacePreset[] = [
  P('Essentials', ['properties', 'layers', 'color', 'stroke', 'align', 'artboards'], []),
  P('Essentials Classic', ['color', 'stroke', 'transparency', 'align', 'pathfinder', 'layers', 'artboards'], []),
  P('Typography', ['properties', 'typography', 'color', 'layers', 'artboards'], []),
  P('Illustration', ['properties', 'appearance', 'color', 'stroke', 'pathfinder', 'transform', 'layers', 'artboards'], []),
  P('Layout', ['properties', 'align', 'transform', 'typography', 'layers', 'artboards', 'docinfo'], []),
  P('Print Production', ['properties', 'docinfo', 'color', 'stroke', 'transparency', 'artboards', 'layers', 'actions'], []),
  P('All Panels', ALL_PANELS.slice(), []),
  P('Automation', ['properties', 'actions', 'layers', 'artboards', 'docinfo'], []),
];

const LS = 'vs.workspaces.v1';
const sanitize = (list: unknown): string[] => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && ALL_PANELS.includes(x)) : []);

/** Which panels are visible, in which order and collapsed or not; plus named presets. Persisted between sessions. */
export class WorkspaceLayout {
  active = 'Essentials';
  current: WorkspacePreset;
  custom: WorkspacePreset[] = [];
  version = 0;
  private listeners = new Set<() => void>();

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.current = structuredClone(BUILTIN_WORKSPACES[0]);
    this.load();
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private touch() { this.version++; this.save(); this.listeners.forEach((l) => l()); }

  get presetNames(): string[] { return [...BUILTIN_WORKSPACES.map((p) => p.name), ...this.custom.map((p) => p.name)]; }
  isBuiltin(name: string) { return BUILTIN_WORKSPACES.some((p) => p.name === name); }
  private find(name: string): WorkspacePreset | undefined { return BUILTIN_WORKSPACES.find((p) => p.name === name) ?? this.custom.find((p) => p.name === name); }

  isVisible(id: string) { return this.current.panels.includes(id); }
  isCollapsed(id: string) { return this.current.collapsed.includes(id); }
  /** True when the live arrangement differs from the named preset it started from. */
  get modified(): boolean {
    const p = this.find(this.active);
    return !p || JSON.stringify([p.panels, p.collapsed]) !== JSON.stringify([this.current.panels, this.current.collapsed]);
  }

  show(id: string, visible: boolean) {
    if (!ALL_PANELS.includes(id)) return;
    const has = this.current.panels.includes(id);
    if (visible && !has) {
      // keep the canonical order for panels that were hidden
      const idx = ALL_PANELS.indexOf(id);
      const pos = this.current.panels.findIndex((x) => ALL_PANELS.indexOf(x) > idx);
      this.current.panels.splice(pos < 0 ? this.current.panels.length : pos, 0, id);
    } else if (!visible && has) {
      this.current.panels = this.current.panels.filter((x) => x !== id);
      this.current.collapsed = this.current.collapsed.filter((x) => x !== id);
    }
    this.touch();
  }
  toggleCollapsed(id: string) {
    this.current.collapsed = this.isCollapsed(id) ? this.current.collapsed.filter((x) => x !== id) : [...this.current.collapsed, id];
    this.touch();
  }
  move(id: string, delta: -1 | 1) {
    const i = this.current.panels.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= this.current.panels.length) return;
    [this.current.panels[i], this.current.panels[j]] = [this.current.panels[j], this.current.panels[i]];
    this.touch();
  }

  switchTo(name: string) {
    const p = this.find(name);
    if (!p) throw new Error(`No workspace named "${name}"`);
    this.active = name;
    this.current = structuredClone(p);
    this.touch();
  }
  /** Back to the stored definition of the active workspace. */
  reset() { this.switchTo(this.active); }

  saveAs(name: string) {
    const n = name.trim();
    if (!n || n.length > 40) throw new Error('Enter a workspace name (up to 40 characters)');
    if (this.isBuiltin(n)) throw new Error(`"${n}" is a built-in workspace; choose another name`);
    const snap = structuredClone(this.current);
    snap.name = n;
    const i = this.custom.findIndex((p) => p.name === n);
    if (i >= 0) this.custom[i] = snap; else this.custom.push(snap);
    this.active = n;
    this.touch();
  }
  rename(from: string, to: string) {
    const n = to.trim();
    if (this.isBuiltin(from)) throw new Error('Built-in workspaces cannot be renamed');
    if (!n || n.length > 40 || this.presetNames.includes(n)) throw new Error('Choose a unique name (up to 40 characters)');
    const p = this.custom.find((x) => x.name === from);
    if (!p) throw new Error('Workspace not found');
    p.name = n;
    if (this.active === from) this.active = n;
    this.touch();
  }
  duplicate(name: string): string {
    const p = this.find(name);
    if (!p) throw new Error('Workspace not found');
    let n = `${name} copy`;
    while (this.presetNames.includes(n)) n += ' (2)';
    this.custom.push({ ...structuredClone(p), name: n });
    this.touch();
    return n;
  }
  delete(name: string) {
    if (this.isBuiltin(name)) throw new Error('Built-in workspaces cannot be deleted');
    this.custom = this.custom.filter((p) => p.name !== name);
    if (this.active === name) { this.active = 'Essentials'; this.current = structuredClone(BUILTIN_WORKSPACES[0]); }
    this.touch();
  }

  private save() { try { this.storage?.setItem(LS, JSON.stringify({ active: this.active, current: this.current, custom: this.custom })); } catch { /* storage unavailable: layout still works for this session */ } }
  private load() {
    try {
      const raw = this.storage?.getItem(LS);
      if (!raw) return;
      const d = JSON.parse(raw) as { active?: string; current?: WorkspacePreset; custom?: WorkspacePreset[] };
      this.custom = (d.custom ?? []).filter((p) => p && typeof p.name === 'string' && p.name.length <= 40).map((p) => P(p.name, sanitize(p.panels), sanitize(p.collapsed)));
      const panels = sanitize(d.current?.panels);
      if (panels.length) this.current = P(d.active ?? 'Essentials', panels, sanitize(d.current?.collapsed));
      if (d.active && this.find(d.active)) this.active = d.active;
    } catch { /* damaged data: keep defaults */ }
  }
}

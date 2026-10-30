import { describe, expect, it } from 'vitest';
import { ALL_PANELS, BUILTIN_WORKSPACES, WorkspaceLayout } from '../../src/ui/workspace-layout';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('workspace layout', () => {
  it('built-in presets only reference real panels and include the spec names', () => {
    const names = BUILTIN_WORKSPACES.map((p) => p.name);
    for (const n of ['Essentials', 'Essentials Classic', 'Typography', 'Illustration', 'Layout', 'Print Production']) expect(names).toContain(n);
    for (const p of BUILTIN_WORKSPACES) for (const id of p.panels) expect(ALL_PANELS, `${p.name}: ${id}`).toContain(id);
    expect(new Set(names).size).toBe(names.length);
  });
  it('show/hide/reorder/collapse change the live layout and mark it modified; reset restores', () => {
    const l = new WorkspaceLayout(mem());
    expect(l.modified).toBe(false);
    l.show('transform', true);
    expect(l.isVisible('transform')).toBe(true);
    expect(l.modified).toBe(true);
    l.show('layers', false);
    expect(l.isVisible('layers')).toBe(false);
    l.move('color', -1);
    const order = l.current.panels.slice();
    expect(order.indexOf('color')).toBeLessThan(order.indexOf('properties') + 2);
    l.toggleCollapsed('color');
    expect(l.isCollapsed('color')).toBe(true);
    l.reset();
    expect(l.modified).toBe(false);
    expect(l.isVisible('layers')).toBe(true);
    expect(l.isVisible('transform')).toBe(false);
    l.move('properties', -1);                                        // already first: no change
    expect(l.current.panels[0]).toBe('properties');
  });
  it('custom workspaces: save, switch, rename, duplicate, delete; names are validated; built-ins are protected', () => {
    const l = new WorkspaceLayout(mem());
    l.show('actions', true); l.show('artboards', false);
    l.saveAs('Mine');
    expect(l.active).toBe('Mine');
    expect(l.modified).toBe(false);
    l.switchTo('Typography');
    expect(l.isVisible('typography')).toBe(true);
    l.switchTo('Mine');
    expect(l.isVisible('actions')).toBe(true);
    expect(l.isVisible('artboards')).toBe(false);
    const copy = l.duplicate('Mine');
    expect(copy).toBe('Mine copy');
    l.rename('Mine copy', 'Second');
    expect(l.presetNames).toContain('Second');
    expect(() => l.rename('Second', 'Mine')).toThrow(/unique/);
    expect(() => l.rename('Typography', 'X')).toThrow(/Built-in/);
    expect(() => l.saveAs('Essentials')).toThrow(/built-in/);
    expect(() => l.saveAs('  ')).toThrow();
    expect(() => l.delete('Layout')).toThrow(/Built-in/);
    l.switchTo('Second'); l.delete('Second');
    expect(l.active).toBe('Essentials');
    expect(l.presetNames).not.toContain('Second');
    expect(() => l.switchTo('Nope')).toThrow();
  });
  it('persists between sessions, including unsaved tweaks, and survives damaged storage', () => {
    const store = mem();
    const l = new WorkspaceLayout(store);
    l.show('docinfo', true); l.saveAs('Keep'); l.show('layers', false);
    const again = new WorkspaceLayout(store);
    expect(again.active).toBe('Keep');
    expect(again.isVisible('layers')).toBe(false);          // the tweak made after saving is remembered
    expect(again.custom.map((p) => p.name)).toEqual(['Keep']);
    again.reset();
    expect(again.isVisible('layers')).toBe(true);
    const bad = { getItem: () => '{"active":5,"custom":[{"name":1}]', setItem: () => { throw new Error('quota'); } };
    const safe = new WorkspaceLayout(bad);
    expect(safe.active).toBe('Essentials');
    expect(() => safe.show('align', true)).not.toThrow();
    const junk = { getItem: () => JSON.stringify({ active: 'Keep', current: { panels: ['nope', 'layers'] }, custom: [{ name: 'Keep', panels: ['layers', 'zzz'], collapsed: 3 }] }), setItem: () => {} };
    const filtered = new WorkspaceLayout(junk);
    expect(filtered.current.panels).toEqual(['layers']);       // unknown panel ids are dropped
    expect(filtered.custom[0].collapsed).toEqual([]);
  });
});

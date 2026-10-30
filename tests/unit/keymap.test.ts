import { describe, expect, it } from 'vitest';
import { eventToShortcut, Keymap, normalizeShortcut } from '../../src/ui/keymap';
import { COMMANDS } from '../../src/ui/commands';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const ev = (key: string, code: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });

describe('shortcut strings', () => {
  it('normalises and builds canonical forms from real key events', () => {
    expect(normalizeShortcut('shift+ctrl+z')).toBe('Ctrl+Shift+Z');
    expect(normalizeShortcut('Ctrl++')).toBe('Ctrl++');
    expect(normalizeShortcut('alt+ctrl+7')).toBe('Ctrl+Alt+7');
    expect(normalizeShortcut('delete')).toBe('Delete');
    expect(eventToShortcut(ev('z', 'KeyZ', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z');
    expect(eventToShortcut(ev('Z', 'KeyZ', { metaKey: true }))).toBe('Ctrl+Z');          // Cmd behaves like Ctrl
    expect(eventToShortcut(ev('}', 'BracketRight', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+]');
    expect(eventToShortcut(ev('+', 'Equal', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl++');
    expect(eventToShortcut(ev('!', 'Digit1', { shiftKey: true, altKey: true }))).toBe('Alt+Shift+1');
    expect(eventToShortcut(ev('Control', 'ControlLeft', { ctrlKey: true }))).toBeNull();      // a lone modifier is not a shortcut
    expect(eventToShortcut(ev('F1', 'F1'))).toBe('F1');
    expect(eventToShortcut(ev('\\', 'Backslash'))).toBe('\\');
  });
});

describe('keymap', () => {
  const defaults = COMMANDS;
  it('ships the Illustrator-style defaults from the spec (for tools that exist) without conflicts', () => {
    const km = new Keymap(defaults, mem());
    const expectMap: Record<string, string> = {
      'tool.select': 'V', 'tool.direct': 'A', 'tool.pen': 'P', 'tool.text': 'T', 'tool.rect': 'M', 'tool.ellipse': 'L', 'tool.pencil': 'N', 'tool.eyedropper': 'I',
      'tool.gradient': 'G', 'tool.wand': 'Y', 'tool.lasso': 'Q', 'tool.hand': 'H', 'tool.zoom': 'Z', 'tool.artboard': 'Shift+O',
      'object.group': 'Ctrl+G', 'object.ungroup': 'Ctrl+Shift+G', 'edit.undo': 'Ctrl+Z', 'edit.redo': 'Ctrl+Shift+Z', 'edit.copy': 'Ctrl+C', 'edit.paste': 'Ctrl+V',
      'edit.pasteFront': 'Ctrl+F', 'edit.pasteBack': 'Ctrl+B', 'file.save': 'Ctrl+S', 'file.saveAs': 'Ctrl+Shift+S',
    };
    for (const [id, sc] of Object.entries(expectMap)) expect(km.get(id), id).toBe(sc);
    const seen = new Map<string, string>();
    for (const c of defaults) { const s = km.get(c.id); if (!s) continue; expect(seen.get(s), `${s} used by ${seen.get(s)} and ${c.id}`).toBeUndefined(); seen.set(s, c.id); }
  });
  it('edits fork a Custom preset, detect conflicts, allow stealing, reset, persist', () => {
    const store = mem();
    const km = new Keymap(defaults, store);
    km.set('object.group', 'Ctrl+Alt+G');
    expect(km.active).toBe('Custom');
    expect(km.get('object.group')).toBe('Ctrl+Alt+G');
    expect(km.commandFor('ctrl+alt+g')).toBe('object.group');
    expect(km.commandFor('Ctrl+G')).toBeUndefined();          // old binding freed
    expect(() => km.set('object.ungroup', 'Ctrl+C')).toThrow(/already used by "edit.copy"/);
    km.set('object.ungroup', 'Ctrl+C', true);
    expect(km.get('edit.copy')).toBeUndefined();               // taken away from the previous owner
    km.set('edit.copy', '');                                   // clearing is allowed
    expect(km.get('edit.copy')).toBeUndefined();
    const again = new Keymap(defaults, store);                 // restart
    expect(again.active).toBe('Custom');
    expect(again.get('object.group')).toBe('Ctrl+Alt+G');
    again.reset('object.group');
    expect(again.get('object.group')).toBe('Ctrl+G');
    again.selectPreset('Illustrator');
    expect(again.get('object.ungroup')).toBe('Ctrl+Shift+G');  // built-in preset is untouched
    expect(() => again.selectPreset('Nope')).toThrow();
  });
  it('saves named presets, exports and imports them, reports unknown commands and duplicate bindings', () => {
    const km = new Keymap(defaults, mem());
    km.set('tool.pen', 'K');
    km.saveAs('Mine');
    const json = km.toJSON();
    const km2 = new Keymap(defaults, mem());
    const ids = new Set(defaults.map((c) => c.id));
    const r = km2.importJSON(json, ids);
    expect(r.name).toBe('Mine');
    expect(km2.get('tool.pen')).toBe('K');
    const withUnknown = JSON.parse(json); withUnknown.shortcuts['tool.teleport'] = 'Ctrl+9'; withUnknown.name = 'Other';
    expect(km2.importJSON(JSON.stringify(withUnknown), ids).ignored).toEqual(['tool.teleport']);
    const dup = JSON.parse(json); dup.shortcuts['tool.select'] = 'K';
    expect(() => km2.importJSON(JSON.stringify(dup), ids)).toThrow(/assigned to both/);
    expect(() => km2.importJSON('nope', ids)).toThrow(/valid JSON/);
    expect(() => km2.importJSON('{"format":"x"}', ids)).toThrow(/Not a shortcut preset/);
    expect(() => km.saveAs('Illustrator')).toThrow();
    km.deletePreset('Mine');
    expect(km.active).toBe('Illustrator');
    expect(km.get('tool.pen')).toBe('P');
  });
  it('survives corrupted storage', () => {
    const bad = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
    const km = new Keymap(defaults, bad);
    expect(km.active).toBe('Illustrator');
    expect(() => km.set('tool.pen', 'K')).not.toThrow();       // a failing save must not break editing
  });
});

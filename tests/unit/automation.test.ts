import { beforeEach, describe, expect, it } from 'vitest';
import { addElement, createDocument, createRect, History, listColors, setIdGenerator, solid, worldBounds } from '../../src/core/document';
import { applyActions, parseActions } from '../../src/automation/actions';
import { parseSizes, sizeVariants } from '../../src/automation/batch';
import { listPlugins, podToolsPlugin, registerPlugin, unregisterPlugin, type PluginApi } from '../../src/automation/plugin';

beforeEach(() => { let i = 0; setIdGenerator(() => 'a' + ++i); });

describe('action lists', () => {
  it('validate strictly and give readable errors', () => {
    expect(parseActions([{ type: 'reduceColors', max: 4 }, { type: 'setBackground', color: null }])).toHaveLength(2);
    expect(() => parseActions([{ type: 'reduceColors', max: 0 }])).toThrow(/Invalid action list at "0.max"/);
    expect(() => parseActions([{ type: 'explode' }])).toThrow(/Invalid action list/);
    expect(() => parseActions({ type: 'cleanup' })).toThrow();
    expect(() => parseActions([{ type: 'replaceColor', from: 'red', to: '#000000' }])).toThrow();
  });
  it('apply in order to a copy, leaving the source untouched, and log what happened', () => {
    const doc = createDocument('d', 1000, 1000);
    addElement(doc, createRect(100, 100, 400, 400, { fill: solid('#ff0000') }));
    addElement(doc, createRect(500, 500, 100, 100, { fill: solid('#fe0101') }));
    addElement(doc, createRect(0, 0, 5, 5, { visible: false }));
    const before = JSON.stringify(doc);
    const { doc: out, log } = applyActions(doc, parseActions([
      { type: 'cleanup' }, { type: 'reduceColors', max: 1 }, { type: 'replaceColor', from: '#ff0000', to: '#00ff00' },
      { type: 'resizeArtboard', width: 500, height: 500, mode: 'fit' }, { type: 'setBackground', color: null }, { type: 'setPpi', ppi: 300 },
    ]));
    expect(JSON.stringify(doc)).toBe(before);
    expect(log).toHaveLength(6);
    expect(out.layers[0].children).toHaveLength(2);
    expect(listColors(out).map((c) => c.color)).toHaveLength(1);
    expect(out.artboards[0]).toMatchObject({ w: 500, h: 500, background: null });
    expect(out.ppi).toBe(300);
    expect(worldBounds(out, out.layers[0].children[0].id)!.w).toBeCloseTo(200);
  });
  it('unknown artboard names fail loudly', () => {
    expect(() => applyActions(createDocument(), [{ type: 'resizeArtboard', artboard: 'Nope', width: 10, height: 10 }])).toThrow(/No artboard named/);
  });
});

describe('batch sizes', () => {
  it('parses size lists and rejects bad lines', () => {
    expect(parseSizes('4500x5400\n3000×3000 Square\n\n1500x1800, small')).toEqual([
      { width: 4500, height: 5400, name: '4500x5400' }, { width: 3000, height: 3000, name: 'Square' }, { width: 1500, height: 1800, name: 'small' },
    ]);
    expect(() => parseSizes('big')).toThrow(/Cannot read size "big"/);
    expect(() => parseSizes('99999x10')).toThrow(/out of range/);
    expect(() => parseSizes('  \n')).toThrow(/at least one/);
  });
  it('creates independent variants with content scaled to each size', () => {
    const doc = createDocument('d', 4500, 5400);
    const r = createRect(1000, 1000, 2500, 3400);
    addElement(doc, r);
    const vs = sizeVariants(doc, doc.artboards[0].id, parseSizes('2250x2700\n900x900'), 'fit');
    expect(vs.map((v) => [v.artboard.w, v.artboard.h])).toEqual([[2250, 2700], [900, 900]]);
    expect(worldBounds(vs[0].doc, r.id)!.w).toBeCloseTo(1250);
    expect(worldBounds(vs[1].doc, r.id)!.h).toBeCloseTo(900 * (3400 / 5400));
    expect(doc.artboards[0].w).toBe(4500);
    expect(worldBounds(doc, r.id)!.w).toBe(2500);
    expect(() => sizeVariants(doc, 'missing', [{ name: 'x', width: 1, height: 1 }], 'fit')).toThrow();
  });
});

describe('plugin API', () => {
  it('registers, validates ids, and runs a command through the narrow API with undo', () => {
    registerPlugin(podToolsPlugin);
    expect(listPlugins().map((p) => p.id)).toContain('vs.pod-tools');
    expect(() => registerPlugin(podToolsPlugin)).toThrow(/already registered/);
    expect(() => registerPlugin({ id: 'bad id!', name: 'x', version: '1', commands: [] })).toThrow(/Invalid plugin id/);
    expect(() => registerPlugin({ id: 'dup', name: 'x', version: '1', commands: [{ id: 'a', label: 'a', run() {} }, { id: 'a', label: 'b', run() {} }] })).toThrow(/duplicate command/);
    const h = new History(createDocument('d', 1000, 1000));
    const messages: string[] = [];
    const api: PluginApi = { get doc() { return h.doc; }, selection: [], apply: (l, r) => { h.apply(l, r); }, select() {}, notify: (m) => messages.push(m) };
    void podToolsPlugin.commands[0].run(api);
    expect(h.doc.guides).toHaveLength(5);
    expect(h.doc.guides![0]).toMatchObject({ axis: 'v', pos: 500 });
    expect(messages[0]).toMatch(/guides/);
    h.undo();
    expect(h.doc.guides ?? []).toHaveLength(0);
    unregisterPlugin('vs.pod-tools');
    expect(listPlugins().map((p) => p.id)).not.toContain('vs.pod-tools');
  });
});

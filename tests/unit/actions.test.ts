import { beforeEach, describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { addElement, createDocument, createRect, serializeDocument, setIdGenerator, solid, worldBounds, listColors } from '../../src/core/document';
import { Editor } from '../../src/editor/editor';
import { ActionLibrary, ActionLibraryError, validateAction } from '../../src/automation/library';
import { PlayControl, playAction, Recorder, undoPlayback } from '../../src/automation/player';
import { applyNamePattern, runActionBatch } from '../../src/automation/batch-actions';
import { describeStep, STEPS, validateStep, type ExportedFile, type StepContext } from '../../src/automation/steps';
import { exportImage } from '../../src/render/export-node';

beforeEach(() => { let i = 0; setIdGenerator(() => 'q' + ++i); });

const rasterize: StepContext['rasterize'] = exportImage;
function docWith(...rects: [number, number, number, number, string][]) {
  const doc = createDocument('t', 1000, 1000);
  doc.artboards[0].background = null;
  rects.forEach(([x, y, w, h, c]) => addElement(doc, createRect(x, y, w, h, { fill: solid(c), stroke: null })));
  return doc;
}
function ctxFor(doc = docWith([100, 100, 200, 200, '#ff0000'], [500, 500, 100, 100, '#fe0000'])) {
  const out: ExportedFile[] = [];
  const editor = new Editor(doc);
  return { ctx: { editor, baseName: 'design', rasterize, emit: (f: ExportedFile) => out.push(f) } as StepContext, out, editor };
}

describe('step registry', () => {
  it('validates parameters and describes steps', () => {
    expect(validateStep({ type: 'align', params: { mode: 'left' } })).toMatchObject({ ok: true, params: { mode: 'left', toArtboard: false } });
    expect(validateStep({ type: 'align', params: { mode: 'sideways' } })).toMatchObject({ ok: false });
    expect(validateStep({ type: 'nope', params: {} })).toMatchObject({ ok: false, error: expect.stringContaining('Unknown step') });
    expect(validateStep({ type: 'setFill', params: { color: 'red' } }).ok).toBe(false);
    expect(describeStep({ id: 'x', type: 'reduceColors', params: { max: 4 }, enabled: true })).toBe('Reduce colours (max=4)');
    expect(new Set(STEPS.map((s) => s.type)).size).toBe(STEPS.length);
  });
});

describe('action library', () => {
  it('creates, renames, duplicates, reorders, toggles, deletes', () => {
    const lib = new ActionLibrary();
    const a = lib.createAction(null, 'Tidy');
    expect(lib.sets).toHaveLength(1);
    const s1 = lib.addStep(a.id, 'selectAll'), s2 = lib.addStep(a.id, 'align', { mode: 'hcenter', toArtboard: true }), s3 = lib.addStep(a.id, 'deselect');
    lib.moveStep(a.id, s3.id, 0);
    expect(lib.find(a.id)!.action.steps.map((s) => s.type)).toEqual(['deselect', 'selectAll', 'align']);
    lib.toggleStep(a.id, s2.id);
    expect(lib.find(a.id)!.action.steps[2].enabled).toBe(false);
    lib.rename(a.id, 'Tidy up');
    const dup = lib.duplicateAction(a.id);
    expect(dup.name).toBe('Tidy up copy');
    expect(dup.steps[0].id).not.toBe(lib.find(a.id)!.action.steps[0].id);
    lib.deleteStep(a.id, s1.id);
    expect(lib.find(a.id)!.action.steps).toHaveLength(2);
    expect(() => lib.addStep(a.id, 'align', { mode: 'bad' })).toThrow(ActionLibraryError);
    expect(() => lib.rename(a.id, '  ')).toThrow(/empty/);
    const set2 = lib.createSet('Second');
    lib.moveAction(dup.id, set2.id, 0);
    expect(lib.find(dup.id)!.set.id).toBe(set2.id);
    lib.deleteAction(dup.id);
    expect(lib.find(dup.id)).toBeNull();
  });
  it('shortcuts must be unique', () => {
    const lib = new ActionLibrary();
    const a = lib.createAction(null, 'A'), b = lib.createAction(null, 'B');
    lib.setShortcut(a.id, 'Ctrl+Shift+1');
    expect(() => lib.setShortcut(b.id, 'ctrl+shift+1')).toThrow(/already used by "A"/);
    lib.setShortcut(a.id, undefined);
    expect(() => lib.setShortcut(b.id, 'Ctrl+Shift+1')).not.toThrow();
  });
  it('survives serialisation (restart) and import/export with fresh ids; rejects damaged or unknown steps', () => {
    const lib = new ActionLibrary();
    const a = lib.createAction(null, 'POD');
    lib.addStep(a.id, 'selectAll'); lib.addStep(a.id, 'reduceColors', { max: 6 }); lib.addStep(a.id, 'exportRaster', { format: 'png', width: 4500, transparent: true });
    const json = lib.toJSON();
    const restored = new ActionLibrary(ActionLibrary.parse(json));
    expect(restored.sets).toEqual(lib.sets);
    const other = new ActionLibrary();
    const added = other.importSets(lib.toJSON(lib.sets[0].id));
    other.importSets(lib.toJSON());
    expect(other.sets).toHaveLength(2);
    expect(other.sets[0].id).not.toBe(lib.sets[0].id);
    expect(added[0].actions[0].steps).toHaveLength(3);
    expect(() => ActionLibrary.parse('not json')).toThrow(/valid JSON/);
    expect(() => ActionLibrary.parse('{"format":"x"}')).toThrow(/Not an action set file/);
    const bad = JSON.parse(json); bad.sets[0].actions[0].steps[1].params.max = 0;
    expect(() => ActionLibrary.parse(JSON.stringify(bad))).toThrow(/Reduce colours/);
    const unknown = JSON.parse(json); unknown.sets[0].actions[0].steps[0].type = 'teleport';
    expect(() => ActionLibrary.parse(JSON.stringify(unknown))).toThrow(/Unknown step/);
  });
  it('validation flags missing selection, interactive steps and empty actions', () => {
    const lib = new ActionLibrary();
    const a = lib.createAction(null, 'X');
    expect(validateAction(a.id ? lib.find(a.id)!.action : a).some((p) => /no enabled steps/.test(p.text))).toBe(true);
    lib.addStep(a.id, 'align', { mode: 'left' }); lib.addStep(a.id, 'prompt', { message: 'check' });
    const issues = validateAction(lib.find(a.id)!.action);
    expect(issues.some((p) => /needs a selection/.test(p.text))).toBe(true);
    expect(issues.some((p) => /unattended/.test(p.text))).toBe(true);
  });
});

describe('recording', () => {
  it('records only while recording and not paused; recorded steps are valid', () => {
    const lib = new ActionLibrary();
    const a = lib.createAction(null, 'R');
    const rec = new Recorder((id, type, params) => { lib.addStep(id, type, params); });
    expect(rec.note('selectAll', {})).toBe(false);
    rec.start(a.id);
    expect(rec.note('selectAll', {})).toBe(true);
    rec.pause();
    expect(rec.note('group', {})).toBe(false);
    rec.resume();
    expect(rec.note('align', { mode: 'left' })).toBe(true);
    expect(() => rec.note('align', { mode: 'nowhere' })).toThrow();
    rec.stop();
    expect(rec.note('deselect', {})).toBe(false);
    expect(lib.find(a.id)!.action.steps.map((s) => s.type)).toEqual(['selectAll', 'align']);
  });
});

describe('playback', () => {
  function action(...steps: [string, Record<string, unknown>][]) {
    const lib = new ActionLibrary();
    const a = lib.createAction(null, 'A');
    steps.forEach(([t, p]) => lib.addStep(a.id, t, p));
    return lib.find(a.id)!.action;
  }
  it('runs steps on the real document, reports progress, and undoes as a whole', async () => {
    const { ctx, editor } = ctxFor();
    const prog: number[] = [];
    const a = action(['selectAll', {}], ['align', { mode: 'left' }], ['reduceColors', { max: 1 }], ['setBackground', { color: '#ffffff' }]);
    const r = await playAction(a, ctx, { onProgress: (i) => prog.push(i) });
    expect(r.status).toBe('completed');
    expect(r.stepsRun).toBe(4);
    expect(prog).toEqual([0, 1, 2, 3, 4]);
    const ids = editor.doc.layers[0].children.map((e) => e.id);
    expect(ids.map((id) => worldBounds(editor.doc, id)!.x)).toEqual([100, 100]);
    expect(listColors(editor.doc)).toHaveLength(1);
    expect(editor.doc.artboards[0].background).toBe('#ffffff');
    expect(undoPlayback(ctx, r)).toBeGreaterThanOrEqual(3);
    expect(listColors(editor.doc)).toHaveLength(2);
    expect(editor.doc.artboards[0].background).toBeNull();
  });
  it('disabled steps are skipped; failing steps stop playback with the step named; Stop step ends cleanly', async () => {
    const { ctx } = ctxFor();
    const lib = new ActionLibrary();
    const a = lib.createAction(null, 'A');
    const s = lib.addStep(a.id, 'setBackground', { color: '#000000' });
    lib.toggleStep(a.id, s.id);
    lib.addStep(a.id, 'group', {});            // nothing selected → fails
    lib.addStep(a.id, 'setBackground', { color: '#111111' });
    const r = await playAction(lib.find(a.id)!.action, ctx);
    expect(r.status).toBe('failed');
    expect(r.failedStep?.type).toBe('group');
    expect(r.error).toMatch(/nothing is selected/);
    expect(ctx.editor.doc.artboards[0].background).toBeNull();      // later steps did not run, disabled one did not run
    const r2 = await playAction(action(['setBackground', { color: '#222222' }], ['stop', {}], ['setBackground', { color: '#333333' }]), ctx);
    expect(r2.status).toBe('stopped');
    expect(ctx.editor.doc.artboards[0].background).toBe('#222222');
    const r3 = await playAction(action(['exportRaster', { format: 'png' }]), { ...ctx, rasterize: undefined });
    expect(r3.error).toMatch(/cannot rasterise/);
  });
  it('pause / resume / step / stop controls', async () => {
    const { ctx, editor } = ctxFor();
    const a = action(['setBackground', { color: '#111111' }], ['setBackground', { color: '#222222' }], ['setBackground', { color: '#333333' }]);
    const control = new PlayControl();
    control.pause();
    const p = playAction(a, ctx, { control });
    await new Promise((r) => setTimeout(r, 20));
    expect(editor.doc.artboards[0].background).toBeNull();           // paused before the first step
    control.step();
    await new Promise((r) => setTimeout(r, 20));
    expect(editor.doc.artboards[0].background).toBe('#111111');      // exactly one step ran
    control.step();
    await new Promise((r) => setTimeout(r, 20));
    expect(editor.doc.artboards[0].background).toBe('#222222');
    control.resume();
    expect((await p).status).toBe('completed');
    expect(editor.doc.artboards[0].background).toBe('#333333');
    const c2 = new PlayControl(); c2.pause();
    const p2 = playAction(a, ctxFor().ctx, { control: c2 });
    c2.stop();
    expect((await p2).status).toBe('stopped');
  });
  it('export steps emit correct files (PNG size/transparency, SVG, PDF, copy)', async () => {
    const { ctx, out } = ctxFor();
    const a = action(['exportRaster', { format: 'png', width: 500, transparent: true, ppi: 300 }], ['exportSvg', {}], ['exportPdf', {}], ['saveCopy', { suffix: '-v2' }]);
    expect((await playAction(a, ctx)).status).toBe('completed');
    expect(out.map((f) => f.name)).toEqual(['design.png', 'design.svg', 'design.pdf', 'design-v2.vstudio']);
    const png = PNG.sync.read(Buffer.from(out[0].data as Uint8Array));
    expect([png.width, png.height]).toEqual([500, 500]);
    expect(png.data[3]).toBe(0);
    expect(String(out[1].data)).toContain('<svg');
    expect(Buffer.from(out[2].data as Uint8Array).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('recorded text and compound/boolean steps work end to end', async () => {
    const { ctx, editor } = ctxFor(docWith([0, 0, 100, 100, '#00ff00'], [50, 50, 100, 100, '#00ff00']));
    const r = await playAction(action(['selectAll', {}], ['boolean', { op: 'unite' }]), ctx);
    expect(r.status).toBe('completed');
    expect(editor.doc.layers[0].children).toHaveLength(1);
    expect(editor.doc.layers[0].children[0].type).toBe('path');
  });
});

describe('batch processing', () => {
  const inputs = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `job${i + 1}.vstudio`, text: serializeDocument(docWith([100, 100, 200, 200, '#ff0000'])) }));
  function act(...steps: [string, Record<string, unknown>][]) {
    const lib = new ActionLibrary(); const a = lib.createAction(null, 'B'); steps.forEach(([t, p]) => lib.addStep(a.id, t, p)); return lib.find(a.id)!.action;
  }
  it('processes files sequentially, names outputs by pattern, leaves inputs untouched', async () => {
    const ins = inputs(3);
    const before = ins.map((i) => i.text);
    const progress: string[] = [];
    const { files, outputs } = await runActionBatch(ins, { action: act(['resizeArtboard', { width: 200, height: 200, mode: 'fit' }], ['exportRaster', { format: 'png', scale: 1, transparent: true, suffix: '-small' }]), namePattern: '{n}_{name}{file}', rasterize, onFile: (i, t, n) => progress.push(`${i + 1}/${t} ${n}`) });
    expect(files.map((f) => f.status)).toEqual(['ok', 'ok', 'ok']);
    expect(progress).toEqual(['1/3 job1.vstudio', '2/3 job2.vstudio', '3/3 job3.vstudio']);
    expect(outputs.map((o) => o.name)).toEqual(['1_job1job1-small.png', '2_job2job2-small.png', '3_job3job3-small.png']);
    expect(PNG.sync.read(Buffer.from(outputs[0].data as Uint8Array)).width).toBe(200);
    expect(ins.map((i) => i.text)).toEqual(before);
  });
  it('reports per-file failures, continues, retries, and can stop on first error', async () => {
    const ins = [...inputs(1), { name: 'broken.vstudio', text: '{"nope":1}' }, ...inputs(1).map((i) => ({ ...i, name: 'job9.vstudio' }))];
    const a = act(['saveCopy', { suffix: '-ok' }]);
    const r = await runActionBatch(ins, { action: a, rasterize, retries: 1 });
    expect(r.files.map((f) => f.status)).toEqual(['ok', 'failed', 'ok']);
    expect(r.files[1]).toMatchObject({ attempts: 2, error: expect.stringContaining('Not a Vector Studio') });
    expect(r.outputs).toHaveLength(2);
    const r2 = await runActionBatch(ins, { action: a, rasterize, continueOnError: false });
    expect(r2.files.map((f) => f.status)).toEqual(['ok', 'failed', 'skipped']);
  });
  it('failing steps are reported per file with the step name; cancellation marks the rest cancelled', async () => {
    const r = await runActionBatch(inputs(2), { action: act(['group', {}]), rasterize });
    expect(r.files[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/Group.*nothing is selected/) });
    const signal = { aborted: false };
    const r2 = await runActionBatch(inputs(3), { action: act(['saveCopy', { suffix: '' }]), rasterize, signal, onFile: (i) => { if (i === 1) signal.aborted = true; } });
    expect(r2.files.map((f) => f.status)).toEqual(['ok', 'cancelled', 'cancelled']);
  });
  it('rejects unusable configurations up front', async () => {
    await expect(runActionBatch([], { action: act(['deselect', {}]) })).rejects.toThrow(/No input/);
    await expect(runActionBatch(inputs(2), { action: act(['prompt', { message: 'hi' }]) })).rejects.toThrow(/unattended/);
    await expect(runActionBatch(inputs(2), { action: act(['saveCopy', {}]), namePattern: 'fixed' })).rejects.toThrow(/overwrite/);
    const lib = new ActionLibrary(); const a = lib.createAction(null, 'bad'); a.steps.push({ id: 'z', type: 'align', params: { mode: 'nope' }, enabled: true });
    await expect(runActionBatch(inputs(1), { action: a })).rejects.toThrow(/invalid/);
  });
  it('saveResultIfNoExport writes a processed copy; name patterns sanitise tokens', async () => {
    const r = await runActionBatch(inputs(1), { action: act(['setBackground', { color: '#ffffff' }]), saveResultIfNoExport: true });
    expect(r.outputs.map((o) => o.name)).toEqual(['job1-processed.vstudio']);
    expect(applyNamePattern('a/b:{file}', { file: 'x', name: 'n', n: 2, date: '2026-01-01' })).toBe('a_b_x');
    expect(applyNamePattern('{date}-{n}', { file: 'x', name: 'n', n: 2, date: '2026-01-01' })).toBe('2026-01-01-2');
  });
  it('20 documents run unattended in reasonable time', async () => {
    const t0 = performance.now();
    const r = await runActionBatch(inputs(20), { action: act(['selectAll', {}], ['scaleSelection', { percent: 50 }], ['exportRaster', { format: 'png', width: 256, transparent: true }]), namePattern: '{n}-{file}', rasterize });
    expect(r.files.every((f) => f.status === 'ok')).toBe(true);
    expect(performance.now() - t0).toBeLessThan(15000);
  });
});


import { ActionLibrary, validateAction, type Action } from '../automation/library';
import { PlayControl, playAction, Recorder, undoPlayback, type PlayResult } from '../automation/player';
import { describeStep, stepDef, validateStep, type ActionStep, type ExportedFile, type StepContext } from '../automation/steps';
import type { Editor } from '../editor/editor';
import { exportImage } from '../render/browser-export';
import { platform } from '../platform';
import { useUi } from './store';
import { baseName } from './commands-util';

const KEY = 'vs.actions.v1';

function load(): ActionLibrary {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new ActionLibrary(ActionLibrary.parse(raw));
  } catch (e) {
    try { localStorage.setItem(KEY + '.corrupt', localStorage.getItem(KEY) ?? ''); } catch { /* ignore */ }
    queueMicrotask(() => useUi.getState().notify(`Saved actions could not be read (${(e as Error).message}); a backup was kept and the list was reset`, 'error'));
  }
  const lib = new ActionLibrary();
  lib.createSet('Default Actions');
  return lib;
}

export interface PlayState { running: boolean; paused: boolean; actionId: string | null; index: number; total: number; stepLabel: string; result: PlayResult | null; message: string }

/** App-wide Actions state: the persistent library, the recorder, and the (single) running playback. */
class ActionsService {
  library = load();
  recorder = new Recorder((id, type, params) => { this.library.addStep(id, type, params); });
  play: PlayState = { running: false, paused: false, actionId: null, index: 0, total: 0, stepLabel: '', result: null, message: '' };
  version = 0;
  private listeners = new Set<() => void>();
  private control: PlayControl | null = null;
  private lastCtx: StepContext | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.library.subscribe(() => { this.persist(); this.emit(); });
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.version++; this.listeners.forEach((l) => l()); }
  private persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, this.library.toJSON()); } catch { /* storage full or blocked: actions still work this session */ } }, 150);
  }
  /** Write immediately (tests, and before unload). */
  flush() { if (this.saveTimer) clearTimeout(this.saveTimer); try { localStorage.setItem(KEY, this.library.toJSON()); } catch { /* ignore */ } }

  // ---- recording ----
  get recording() { return this.recorder.recording; }
  startRecording(actionId: string) { this.recorder.start(actionId); this.emit(); }
  stopRecording() { this.recorder.stop(); this.emit(); }
  pauseRecording() { this.recorder.pause(); this.emit(); }
  resumeRecording() { this.recorder.resume(); this.emit(); }
  /** Record a step that the UI has already performed. Invalid parameters are reported, never stored. */
  note(type: string, params: Record<string, unknown>) {
    if (!this.recorder.recording || this.recorder.paused) return;
    try { this.recorder.note(type, params); } catch (e) { useUi.getState().notify(`Could not record "${type}": ${(e as Error).message}`, 'error'); }
  }
  /** Perform a step on the editor (same executor as playback) and record it. Throws if the step fails. */
  async perform(editor: Editor, type: string, params: Record<string, unknown> = {}) {
    const v = validateStep({ type, params });
    if (!v.ok) throw new Error(v.error);
    await stepDef(type)!.run(this.context(editor), v.params);
    this.note(type, v.params);
  }

  // ---- playback ----
  context(editor: Editor, sink?: ExportedFile[]): StepContext {
    return {
      editor, baseName: baseName(editor.fileName ?? editor.doc.name),
      rasterize: async (doc, ab, o) => (await exportImage(doc, ab, { format: o.format, scale: o.scale, width: o.width, transparent: o.transparent, quality: o.quality, ppi: o.ppi })).bytes,
      emit: (f) => { sink?.push(f); },
      prompt: async (m) => { if (!window.confirm(`${m}\n\nOK = continue, Cancel = stop`)) throw new Error('Cancelled by user'); },
    };
  }
  async run(editor: Editor, action: Action, mode: 'play' | 'step' = 'play') {
    if (this.play.running) return;
    const problems = validateAction(action).filter((p) => p.level === 'error');
    if (problems.length) { this.play = { ...this.play, result: null, message: problems[0].text }; this.emit(); return; }
    const files: ExportedFile[] = [];
    const ctx = this.context(editor, files);
    this.lastCtx = ctx;
    this.control = new PlayControl();
    if (mode === 'step') this.control.pause();
    this.play = { running: true, paused: mode === 'step', actionId: action.id, index: 0, total: action.steps.filter((s) => s.enabled).length, stepLabel: '', result: null, message: '' };
    this.emit();
    const wasRecording = this.recorder.recording;
    if (wasRecording) this.recorder.pause(); // playing an action must not record itself
    const r = await playAction(action, ctx, {
      control: this.control,
      onProgress: (i, total, s) => { this.play = { ...this.play, index: i, total, stepLabel: s ? describeStep(s) : '', paused: this.control?.paused ?? false }; this.emit(); },
    });
    if (wasRecording) this.recorder.resume();
    let msg = r.status === 'completed' ? `Finished (${r.stepsRun} steps)` : r.status === 'stopped' ? `Stopped after ${r.stepsRun} steps` : `Failed: ${r.error}`;
    if (files.length) {
      try {
        const saved = files.length === 1
          ? await platform.saveFile({ suggestedName: files[0].name.replace(/\.[^.]+$/, ''), ext: files[0].name.split('.').pop()!, data: files[0].data, mime: files[0].mime, forceDialog: true }).then((x) => (x ? [x.name] : null))
          : await platform.saveFiles(files);
        if (saved) msg += `; saved ${saved.length} file(s)`;
      } catch (e) { msg += `; saving failed: ${(e as Error).message}`; }
    }
    this.play = { ...this.play, running: false, paused: false, result: r, message: msg };
    this.control = null;
    this.emit();
    editor.emit();
  }
  pausePlayback() { this.control?.pause(); this.play = { ...this.play, paused: true }; this.emit(); }
  resumePlayback() { this.control?.resume(); this.play = { ...this.play, paused: false }; this.emit(); }
  stepPlayback() { this.control?.step(); }
  stopPlayback() { this.control?.stop(); }
  undoLastRun(): number {
    if (!this.lastCtx || !this.play.result) return 0;
    const n = undoPlayback(this.lastCtx, this.play.result);
    this.play = { ...this.play, result: null, message: n ? `Undid ${n} change(s) from the last run` : 'Nothing to undo' };
    this.emit();
    return n;
  }

  findByShortcut(matches: (spec: string) => boolean): Action | null {
    for (const s of this.library.sets) for (const a of s.actions) if (a.shortcut && matches(a.shortcut)) return a;
    return null;
  }
  step(actionId: string, stepId: string): ActionStep | undefined { return this.library.find(actionId)?.action.steps.find((s) => s.id === stepId); }
}

export const actions = new ActionsService();

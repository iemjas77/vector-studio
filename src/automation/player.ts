import { describeStep, stepDef, StopAction, validateStep, type ActionStep, type StepContext } from './steps';
import type { Action } from './library';

/** Flow control shared between the UI and a running playback. */
export class PlayControl {
  paused = false;
  stopped = false;
  private waiter: (() => void) | null = null;
  private stepOnce = false;

  pause() { this.paused = true; }
  resume() { this.paused = false; this.stepOnce = false; this.waiter?.(); }
  /** Run exactly one more step, then pause again. */
  step() { this.stepOnce = true; this.waiter?.(); }
  stop() { this.stopped = true; this.paused = false; this.waiter?.(); }

  /** Called before each step. */
  async gate(): Promise<void> {
    if (this.stepOnce) { this.stepOnce = false; this.paused = true; return; }
    while (this.paused && !this.stopped && !this.stepOnce) await new Promise<void>((res) => { this.waiter = res; });
    this.waiter = null;
    if (this.stepOnce) { this.stepOnce = false; this.paused = true; }
  }
}

export interface PlayResult {
  status: 'completed' | 'stopped' | 'failed';
  stepsRun: number;
  failedStep?: ActionStep;
  error?: string;
  /** History entries the action added; `undoPlayback` reverts exactly these. */
  undoEntries: number;
}

export interface PlayOptions {
  control?: PlayControl;
  onProgress?(index: number, total: number, step: ActionStep): void;
}

/** Runs the enabled steps of an action in order. A failing step stops playback and is reported (never skipped silently). */
export async function playAction(action: Action, ctx: StepContext, o: PlayOptions = {}): Promise<PlayResult> {
  const control = o.control ?? new PlayControl();
  const steps = action.steps.filter((s) => s.enabled);
  const depth0 = ctx.editor.history.undoDepth;
  const result = (r: Omit<PlayResult, 'undoEntries'>): PlayResult => ({ ...r, undoEntries: ctx.editor.history.undoDepth - depth0 });
  let run = 0;
  for (let i = 0; i < steps.length; i++) {
    await control.gate();
    if (control.stopped) return result({ status: 'stopped', stepsRun: run });
    const s = steps[i];
    o.onProgress?.(i, steps.length, s);
    const v = validateStep(s);
    if (!v.ok) return result({ status: 'failed', stepsRun: run, failedStep: s, error: v.error });
    try {
      await stepDef(s.type)!.run(ctx, v.params);
      run++;
    } catch (e) {
      if (e instanceof StopAction) return result({ status: 'stopped', stepsRun: run + 1 });
      return result({ status: 'failed', stepsRun: run, failedStep: s, error: `${describeStep(s)}: ${(e as Error).message}` });
    }
  }
  o.onProgress?.(steps.length, steps.length, steps[steps.length - 1]);
  return result({ status: 'completed', stepsRun: run });
}

/** Undo everything an action run changed in the document. */
export function undoPlayback(ctx: StepContext, r: PlayResult): number {
  let n = 0;
  for (let i = 0; i < r.undoEntries; i++) { if (ctx.editor.history.undo()) n++; }
  ctx.editor.emit();
  return n;
}

/** Records semantic steps into an action while `recording` and not `paused`. */
export class Recorder {
  actionId: string | null = null;
  paused = false;
  constructor(private add: (actionId: string, type: string, params: Record<string, unknown>) => void) {}
  get recording() { return this.actionId !== null; }
  start(actionId: string) { this.actionId = actionId; this.paused = false; }
  stop() { this.actionId = null; this.paused = false; }
  pause() { if (this.actionId) this.paused = true; }
  resume() { if (this.actionId) this.paused = false; }
  /** Called by the UI after it performs a step. Returns true if the step was recorded. */
  note(type: string, params: Record<string, unknown>): boolean {
    if (!this.actionId || this.paused) return false;
    this.add(this.actionId, type, params);
    return true;
  }
}

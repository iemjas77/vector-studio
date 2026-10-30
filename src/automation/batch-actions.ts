import { Editor } from '../editor/editor';
import { parseDocument } from '../core/document';
import type { Action } from './library';
import { validateAction } from './library';
import { playAction, PlayControl } from './player';
import type { ExportedFile, StepContext } from './steps';

export interface BatchInput { name: string; text: string }

export interface BatchFileResult {
  name: string;
  status: 'ok' | 'failed' | 'skipped' | 'cancelled';
  attempts: number;
  outputs: string[];
  error?: string;
  ms: number;
}

export interface BatchRunOptions {
  action: Action;
  /** Tokens: {file} step-generated name without extension, {name} source document name, {n} 1-based index, {date} YYYY-MM-DD. */
  namePattern?: string;
  /** Also write the processed document as `<name>-processed.vstudio` when the action exports nothing. */
  saveResultIfNoExport?: boolean;
  /** Continue with the next file after a failure (default true). Otherwise remaining files are skipped. */
  continueOnError?: boolean;
  /** Extra attempts for a failed file. */
  retries?: number;
  rasterize?: StepContext['rasterize'];
  signal?: { aborted: boolean };
  onFile?(index: number, total: number, name: string): void;
  onOutput?(file: ExportedFile): void;
  /** Allow steps that need a person. Unattended batches reject such actions up front. */
  allowInteractive?: boolean;
}

export class BatchConfigError extends Error { constructor(m: string) { super(m); this.name = 'BatchConfigError'; } }

const stem = (n: string) => n.replace(/\.[^.]+$/, '');
export function applyNamePattern(pattern: string, parts: { file: string; name: string; n: number; date: string }): string {
  const out = pattern.replace(/\{file\}/g, parts.file).replace(/\{name\}/g, parts.name).replace(/\{n\}/g, String(parts.n)).replace(/\{date\}/g, parts.date);
  return out.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_'); // eslint-disable-line no-control-regex
}

/**
 * Runs one action over many documents sequentially. Inputs are never modified (outputs go to the sink only). The batch
 * result lists every file with its own status so a failure never disappears.
 */
export async function runActionBatch(inputs: BatchInput[], o: BatchRunOptions): Promise<{ files: BatchFileResult[]; outputs: ExportedFile[] }> {
  if (!inputs.length) throw new BatchConfigError('No input files');
  const problems = validateAction(o.action);
  const errors = problems.filter((p) => p.level === 'error');
  if (errors.length) throw new BatchConfigError(`The action is invalid: ${errors[0].text}`);
  if (!o.allowInteractive && o.action.steps.some((s) => s.enabled && s.type === 'prompt')) throw new BatchConfigError('This action contains a "pause with message" step and cannot run unattended');
  const pattern = o.namePattern?.trim() || '{file}';
  if (!/\{file\}|\{n\}/.test(pattern) && inputs.length > 1) throw new BatchConfigError('The naming pattern must contain {file} or {n}, otherwise files would overwrite each other');
  const date = new Date().toISOString().slice(0, 10);
  const files: BatchFileResult[] = [];
  const outputs: ExportedFile[] = [];
  let stopped = false;

  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    o.onFile?.(i, inputs.length, inp.name);
    if (o.signal?.aborted) { files.push({ name: inp.name, status: 'cancelled', attempts: 0, outputs: [], ms: 0 }); continue; }
    if (stopped) { files.push({ name: inp.name, status: 'skipped', attempts: 0, outputs: [], ms: 0 }); continue; }
    const t0 = performance.now();
    const maxAttempts = 1 + Math.max(0, o.retries ?? 0);
    let result: BatchFileResult | null = null;
    for (let attempt = 1; attempt <= maxAttempts && !result?.status?.startsWith('ok'); attempt++) {
      const produced: ExportedFile[] = [];
      try {
        const doc = parseDocument(inp.text);
        const editor = new Editor(doc);
        const base = stem(inp.name);
        const ctx: StepContext = { editor, baseName: base, rasterize: o.rasterize, emit: (f) => produced.push(f) };
        const r = await playAction(o.action, ctx, { control: new PlayControl() });
        if (r.status === 'failed') throw new Error(r.error ?? 'Step failed');
        if (r.status === 'stopped') throw new Error('The action stopped before finishing');
        if (produced.length === 0 && o.saveResultIfNoExport) {
          const { serializeDocument } = await import('../core/document');
          produced.push({ name: `${base}-processed.vstudio`, data: serializeDocument(editor.doc), mime: 'application/json' });
        }
        const named = produced.map((f) => {
          const dot = f.name.lastIndexOf('.');
          const ext = dot >= 0 ? f.name.slice(dot) : '';
          return { ...f, name: applyNamePattern(pattern, { file: dot >= 0 ? f.name.slice(0, dot) : f.name, name: base, n: i + 1, date }) + ext };
        });
        if (new Set([...outputs.map((x) => x.name), ...named.map((x) => x.name)]).size !== outputs.length + named.length) throw new Error('Output names collide; adjust the naming pattern');
        named.forEach((f) => { outputs.push(f); o.onOutput?.(f); });
        result = { name: inp.name, status: 'ok', attempts: attempt, outputs: named.map((f) => f.name), ms: performance.now() - t0 };
      } catch (e) {
        result = { name: inp.name, status: 'failed', attempts: attempt, outputs: [], error: (e as Error).message, ms: performance.now() - t0 };
      }
    }
    files.push(result!);
    if (result!.status === 'failed' && o.continueOnError === false) stopped = true;
  }
  return { files, outputs };
}

import { z } from 'zod';
import { newId } from '../core/document/ids';
import { validateStep, stepDef, type ActionStep } from './steps';

export interface Action { id: string; name: string; steps: ActionStep[]; shortcut?: string }
export interface ActionSet { id: string; name: string; actions: Action[] }

const stepSchema = z.object({ id: z.string().min(1), type: z.string().min(1), params: z.record(z.string(), z.unknown()), enabled: z.boolean() });
const actionSchema = z.object({ id: z.string().min(1), name: z.string().min(1).max(100), steps: z.array(stepSchema).max(2000), shortcut: z.string().max(40).optional() });
const setSchema = z.object({ id: z.string().min(1), name: z.string().min(1).max(100), actions: z.array(actionSchema).max(500) });
const fileSchema = z.object({ format: z.literal('vector-studio-actions'), version: z.literal(1), sets: z.array(setSchema).max(100) });

export class ActionLibraryError extends Error { constructor(m: string) { super(m); this.name = 'ActionLibraryError'; } }

/** Serializable collection of action sets. Pure data + editing operations; persistence/UI live elsewhere. */
export class ActionLibrary {
  sets: ActionSet[] = [];
  version = 0;
  private listeners = new Set<() => void>();

  constructor(sets: ActionSet[] = []) { this.sets = sets; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private touch() { this.version++; this.listeners.forEach((l) => l()); }

  find(actionId: string): { set: ActionSet; action: Action } | null {
    for (const set of this.sets) { const action = set.actions.find((a) => a.id === actionId); if (action) return { set, action }; }
    return null;
  }

  createSet(name = 'New Set'): ActionSet { const s = { id: newId(), name, actions: [] }; this.sets.push(s); this.touch(); return s; }
  createAction(setId: string | null, name = 'New Action'): Action {
    const set = this.sets.find((s) => s.id === setId) ?? this.sets[0] ?? this.createSet('Default Actions');
    const a: Action = { id: newId(), name, steps: [] };
    set.actions.push(a);
    this.touch();
    return a;
  }
  rename(id: string, name: string): void {
    const n = name.trim();
    if (!n) throw new ActionLibraryError('Name cannot be empty');
    const set = this.sets.find((s) => s.id === id);
    if (set) set.name = n; else { const f = this.find(id); if (!f) throw new ActionLibraryError('Not found'); f.action.name = n; }
    this.touch();
  }
  duplicateAction(id: string): Action {
    const f = this.find(id);
    if (!f) throw new ActionLibraryError('Action not found');
    const copy: Action = { id: newId(), name: `${f.action.name} copy`, steps: f.action.steps.map((s) => ({ ...s, id: newId(), params: structuredClone(s.params) })) };
    f.set.actions.splice(f.set.actions.indexOf(f.action) + 1, 0, copy);
    this.touch();
    return copy;
  }
  deleteAction(id: string): void { const f = this.find(id); if (f) { f.set.actions = f.set.actions.filter((a) => a.id !== id); this.touch(); } }
  deleteSet(id: string): void { this.sets = this.sets.filter((s) => s.id !== id); this.touch(); }
  moveAction(id: string, toSetId: string, index: number): void {
    const f = this.find(id), to = this.sets.find((s) => s.id === toSetId);
    if (!f || !to) throw new ActionLibraryError('Not found');
    f.set.actions = f.set.actions.filter((a) => a.id !== id);
    to.actions.splice(Math.max(0, Math.min(index, to.actions.length)), 0, f.action);
    this.touch();
  }
  setShortcut(id: string, shortcut: string | undefined): void {
    const f = this.find(id);
    if (!f) throw new ActionLibraryError('Action not found');
    if (shortcut) {
      const clash = this.sets.flatMap((s) => s.actions).find((a) => a.id !== id && a.shortcut?.toLowerCase() === shortcut.toLowerCase());
      if (clash) throw new ActionLibraryError(`Shortcut ${shortcut} is already used by "${clash.name}"`);
    }
    f.action.shortcut = shortcut || undefined;
    this.touch();
  }

  addStep(actionId: string, type: string, params: Record<string, unknown> = {}, at?: number): ActionStep {
    const f = this.find(actionId);
    if (!f) throw new ActionLibraryError('Action not found');
    const v = validateStep({ type, params });
    if (!v.ok) throw new ActionLibraryError(v.error);
    const step: ActionStep = { id: newId(), type, params: v.params, enabled: true };
    f.action.steps.splice(at ?? f.action.steps.length, 0, step);
    this.touch();
    return step;
  }
  updateStep(actionId: string, stepId: string, params: Record<string, unknown>): void {
    const f = this.find(actionId);
    const s = f?.action.steps.find((x) => x.id === stepId);
    if (!s) throw new ActionLibraryError('Step not found');
    const v = validateStep({ type: s.type, params });
    if (!v.ok) throw new ActionLibraryError(v.error);
    s.params = v.params;
    this.touch();
  }
  toggleStep(actionId: string, stepId: string): void { const s = this.find(actionId)?.action.steps.find((x) => x.id === stepId); if (s) { s.enabled = !s.enabled; this.touch(); } }
  deleteStep(actionId: string, stepId: string): void { const f = this.find(actionId); if (f) { f.action.steps = f.action.steps.filter((s) => s.id !== stepId); this.touch(); } }
  moveStep(actionId: string, stepId: string, toIndex: number): void {
    const f = this.find(actionId);
    if (!f) return;
    const from = f.action.steps.findIndex((s) => s.id === stepId);
    if (from < 0) return;
    const [s] = f.action.steps.splice(from, 1);
    f.action.steps.splice(Math.max(0, Math.min(toIndex, f.action.steps.length)), 0, s);
    this.touch();
  }

  // ---- (de)serialisation ----
  toJSON(setId?: string): string {
    const sets = setId ? this.sets.filter((s) => s.id === setId) : this.sets;
    return JSON.stringify({ format: 'vector-studio-actions', version: 1, sets }, null, 1);
  }

  /** Parses and validates; every step must be a known, valid step (so a saved library cannot silently rot). */
  static parse(text: string): ActionSet[] {
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new ActionLibraryError('Not valid JSON'); }
    const r = fileSchema.safeParse(data);
    if (!r.success) throw new ActionLibraryError(`Not an action set file: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}`);
    for (const set of r.data.sets) for (const a of set.actions) for (const s of a.steps) {
      const v = validateStep(s);
      if (!v.ok) throw new ActionLibraryError(`Action "${a.name}": ${v.error}`);
    }
    return r.data.sets;
  }

  /** Imports sets from JSON with fresh ids (so importing twice never collides). Returns the new sets. */
  importSets(text: string): ActionSet[] {
    const parsed = ActionLibrary.parse(text);
    const fresh = parsed.map((s) => ({ id: newId(), name: s.name, actions: s.actions.map((a) => ({ ...a, id: newId(), steps: a.steps.map((st) => ({ ...st, id: newId() })) })) }));
    this.sets.push(...fresh);
    this.touch();
    return fresh;
  }

  replaceAll(sets: ActionSet[]): void { this.sets = sets; this.touch(); }
}

/** Problems found without running: unknown steps, bad parameters, steps that need a selection nothing makes. */
export function validateAction(a: Action): { level: 'error' | 'warn'; step?: string; text: string }[] {
  const out: { level: 'error' | 'warn'; step?: string; text: string }[] = [];
  let hasSelection = false;
  for (const s of a.steps) {
    if (!s.enabled) continue;
    const v = validateStep(s);
    if (!v.ok) { out.push({ level: 'error', step: s.id, text: v.error }); continue; }
    const d = stepDef(s.type)!;
    if (d.needsSelection && !hasSelection) out.push({ level: 'warn', step: s.id, text: `${d.label} needs a selection; add Select All or Select by type before it (otherwise it uses whatever is selected when the action starts)` });
    if (s.type === 'selectAll' || s.type === 'selectByType') hasSelection = true;
    if (s.type === 'deselect') hasSelection = false;
    if (d.interactive) out.push({ level: 'warn', step: s.id, text: 'This step waits for a person, so the action cannot run unattended in a batch' });
  }
  if (a.steps.filter((s) => s.enabled).length === 0) out.push({ level: 'warn', text: 'The action has no enabled steps' });
  return out;
}

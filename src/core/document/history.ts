import { produce, type Draft } from 'immer';

/**
 * Snapshot-based undo/redo. Documents are immutable (immer structural sharing), so each
 * history entry is just a reference — cheap even for large documents.
 *
 * Interactive edits (drags) use begin/update/commit so one gesture = one undo step.
 */
export class History<T> {
  private undoStack: { label: string; doc: T }[] = [];
  private redoStack: { label: string; doc: T }[] = [];
  private base: T | null = null;
  private _doc: T;
  /** Increments on every change to `doc` (including undo/redo); cheap change detection for the UI. */
  revision = 0;
  /** Last committed state that was saved; used for the "modified" flag. */
  private savedDoc: T;

  constructor(initial: T, private limit = 500) {
    this._doc = initial;
    this.savedDoc = initial;
  }

  get doc(): T { return this._doc; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string | null { return this.undoStack.at(-1)?.label ?? null; }
  get redoLabel(): string | null { return this.redoStack.at(-1)?.label ?? null; }
  get inTransaction(): boolean { return this.base !== null; }
  get dirty(): boolean { return this._doc !== this.savedDoc; }

  markSaved(): void { this.savedDoc = this._doc; }

  /** Replace everything (open file / new document); clears history. */
  reset(doc: T): void {
    this._doc = doc;
    this.savedDoc = doc;
    this.undoStack = [];
    this.redoStack = [];
    this.base = null;
    this.revision++;
  }

  /** One-shot undoable change. A no-op recipe records nothing. */
  apply(label: string, recipe: (d: Draft<T>) => void): boolean {
    this.begin();
    this.update(recipe);
    return this.commit(label);
  }

  begin(): void {
    if (this.base === null) this.base = this._doc;
  }

  update(recipe: (d: Draft<T>) => void): void {
    if (this.base === null) throw new Error('History.update called outside a transaction');
    this._doc = produce(this._doc, recipe);
    this.revision++;
  }

  /** Close the transaction. Returns false (and records nothing) if the document did not change. */
  commit(label: string): boolean {
    if (this.base === null) return false;
    const base = this.base;
    this.base = null;
    if (base === this._doc) return false;
    this.undoStack.push({ label, doc: base });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }

  /** Inside a transaction: discard in-progress changes but stay in the transaction (for absolute-from-start drags). */
  restoreBase(): void {
    if (this.base === null || this._doc === this.base) return;
    this._doc = this.base;
    this.revision++;
  }

  cancel(): void {
    if (this.base === null) return;
    this._doc = this.base;
    this.base = null;
    this.revision++;
  }

  undo(): boolean {
    if (this.base !== null) this.cancel();
    const e = this.undoStack.pop();
    if (!e) return false;
    this.redoStack.push({ label: e.label, doc: this._doc });
    this._doc = e.doc;
    this.revision++;
    return true;
  }

  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    this.undoStack.push({ label: e.label, doc: this._doc });
    this._doc = e.doc;
    this.revision++;
    return true;
  }
}

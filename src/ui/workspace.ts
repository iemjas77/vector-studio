import { Editor } from '../editor/editor';
import { createDocument } from '../core/document';

/** Open documents (tabs). Each tab owns its own Editor (history, selection, viewport). */
export class Workspace {
  editors: Editor[] = [];
  active = 0;
  version = 0;
  private listeners = new Set<() => void>();
  private unsubs = new Map<Editor, () => void>();
  private counter = 0;

  constructor() {
    this.add(this.createEditor());
  }

  createEditor(w = 1920, h = 1080, name?: string): Editor {
    this.counter++;
    const ed = new Editor(createDocument(name ?? `Untitled-${this.counter}`, w, h));
    return ed;
  }

  get current(): Editor { return this.editors[this.active]; }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  add(ed: Editor, activate = true): Editor {
    this.editors.push(ed);
    this.unsubs.set(ed, ed.subscribe(() => this.emit()));
    if (activate) this.active = this.editors.length - 1;
    this.emit();
    return ed;
  }

  activate(i: number): void {
    if (i < 0 || i >= this.editors.length) return;
    this.current.cancelGesture();
    this.active = i;
    this.emit();
  }

  /** Closes a tab. The caller is responsible for any "unsaved changes" confirmation. */
  close(i: number): void {
    const ed = this.editors[i];
    if (!ed) return;
    this.unsubs.get(ed)?.();
    this.unsubs.delete(ed);
    this.editors.splice(i, 1);
    if (this.editors.length === 0) this.add(this.createEditor());
    this.active = Math.min(this.active, this.editors.length - 1);
    this.emit();
  }

  get anyDirty(): boolean { return this.editors.some((e) => e.history.dirty); }
}

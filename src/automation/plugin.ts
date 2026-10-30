import { addGuide, type VDocument } from '../core/document';

/**
 * Plugin interface. Plugins are bundled TypeScript modules that add commands. They only get the narrow `PluginApi`
 * (read the document, make undoable changes, read/set selection), never the DOM or the editor internals.
 *
 * Loading third-party JavaScript at runtime is deliberately NOT supported yet: the app's Content-Security-Policy forbids
 * eval, and an untrusted-code sandbox has not been designed. See DECISIONS.md.
 */
export interface PluginApi {
  readonly doc: VDocument;
  readonly selection: readonly string[];
  /** One undoable step. */
  apply(label: string, recipe: (doc: VDocument) => void): void;
  select(ids: string[]): void;
  notify(message: string): void;
}

export interface PluginCommand {
  id: string;
  label: string;
  run(api: PluginApi): void | Promise<void>;
}

export interface VectorStudioPlugin {
  id: string;
  name: string;
  version: string;
  commands: PluginCommand[];
}

const plugins = new Map<string, VectorStudioPlugin>();

export function registerPlugin(p: VectorStudioPlugin): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(p.id)) throw new Error(`Invalid plugin id "${p.id}"`);
  if (plugins.has(p.id)) throw new Error(`Plugin "${p.id}" is already registered`);
  const seen = new Set<string>();
  for (const c of p.commands) {
    if (seen.has(c.id)) throw new Error(`Plugin "${p.id}" has duplicate command id "${c.id}"`);
    seen.add(c.id);
  }
  plugins.set(p.id, p);
}
export const unregisterPlugin = (id: string): void => { plugins.delete(id); };
export const listPlugins = (): VectorStudioPlugin[] => [...plugins.values()];

/** Built-in example plugin: print-on-demand helpers. */
export const podToolsPlugin: VectorStudioPlugin = {
  id: 'vs.pod-tools', name: 'Print-on-demand tools', version: '1.0.0',
  commands: [
    {
      id: 'addPrintGuides', label: 'Add Print-Area Guides (centre + safe margins)',
      run(api) {
        const ab = api.doc.artboards[0];
        const margin = Math.round(Math.min(ab.w, ab.h) * 0.05);
        api.apply('Add print-area guides', (d) => {
          addGuide(d, 'v', ab.x + ab.w / 2);
          addGuide(d, 'v', ab.x + margin); addGuide(d, 'v', ab.x + ab.w - margin);
          addGuide(d, 'h', ab.y + margin); addGuide(d, 'h', ab.y + ab.h - margin);
        });
        api.notify('Added centre and 5 % safe-margin guides');
      },
    },
  ],
};

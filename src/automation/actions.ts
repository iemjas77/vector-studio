import { produce } from 'immer';
import { z } from 'zod';
import {
  cleanupDocument, DEFAULT_CLEANUP, reduceColors, replaceColor, resizeArtboardWithContent, type CleanupOptions, type VDocument,
} from '../core/document';

/**
 * Declarative, serialisable actions — the automation format. Everything an action does goes through the same
 * core functions the UI uses, so batch results match what the editor would produce.
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cleanup'), options: z.object({ removeHidden: z.boolean(), removeEmptyGroups: z.boolean(), minArea: z.number().min(0), mergeDistance: z.number().min(0), removeInvisible: z.boolean() }).partial().optional() }),
  z.object({ type: z.literal('reduceColors'), max: z.number().int().min(1).max(256) }),
  z.object({ type: z.literal('replaceColor'), from: hex, to: hex }),
  z.object({ type: z.literal('resizeArtboard'), artboard: z.string().optional(), width: z.number().positive().max(16384), height: z.number().positive().max(16384), mode: z.enum(['none', 'fit', 'fill']).optional() }),
  z.object({ type: z.literal('setBackground'), color: hex.nullable() }),
  z.object({ type: z.literal('setPpi'), ppi: z.number().min(1).max(2400) }),
]);
export type Action = z.infer<typeof actionSchema>;

export function parseActions(json: unknown): Action[] {
  const res = z.array(actionSchema).safeParse(json);
  if (!res.success) {
    const i = res.error.issues[0];
    throw new Error(`Invalid action list at "${i.path.join('.')}": ${i.message}`);
  }
  return res.data;
}

export interface ActionResult { doc: VDocument; log: string[] }

/** Applies actions in order to a copy of the document. Unknown artboard names are an error (a silent no-op would hide typos). */
export function applyActions(doc: VDocument, actions: Action[]): ActionResult {
  const log: string[] = [];
  const out = produce(doc, (d) => {
    for (const a of actions) {
      switch (a.type) {
        case 'cleanup': {
          const r = cleanupDocument(d, { ...DEFAULT_CLEANUP, ...(a.options as Partial<CleanupOptions>) });
          log.push(`cleanup: removed ${r.removedObjects} objects, ${r.removedGroups} groups, ${r.removedNodes} anchors`);
          break;
        }
        case 'reduceColors': {
          const r = reduceColors(d, a.max);
          log.push(`reduceColors: ${r.palette.length} colours, ${r.changed} paints changed`);
          break;
        }
        case 'replaceColor': log.push(`replaceColor: ${replaceColor(d, a.from, a.to)} paints changed`); break;
        case 'resizeArtboard': {
          const targets = a.artboard && a.artboard !== 'all' ? d.artboards.filter((x) => x.name === a.artboard) : d.artboards;
          if (targets.length === 0) throw new Error(`No artboard named "${a.artboard}"`);
          for (const t of targets) resizeArtboardWithContent(d, t.id, a.width, a.height, a.mode ?? 'fit');
          log.push(`resizeArtboard: ${targets.length} artboard(s) → ${a.width}×${a.height} (${a.mode ?? 'fit'})`);
          break;
        }
        case 'setBackground': d.artboards.forEach((x) => { x.background = a.color; }); log.push(`setBackground: ${a.color ?? 'transparent'}`); break;
        case 'setPpi': d.ppi = a.ppi; log.push(`setPpi: ${a.ppi}`); break;
      }
    }
  });
  return { doc: out, log };
}

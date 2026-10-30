import { z } from 'zod';
import { FORMAT_NAME, FORMAT_VERSION, type Element, type VDocument } from './types';

export class DocumentFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentFormatError';
  }
}

const num = z.number().finite();
const matrix = z.tuple([num, num, num, num, num, num]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const solidPaint = z.object({ type: z.literal('solid'), color, alpha: num.min(0).max(1) });
const stops = z.array(z.object({ offset: num.min(0).max(1), color, alpha: num.min(0).max(1) })).min(2);
const paint = z.discriminatedUnion('type', [
  solidPaint,
  z.object({ type: z.literal('linear'), stops, x1: num, y1: num, x2: num, y2: num }),
  z.object({ type: z.literal('radial'), stops, cx: num, cy: num, r: num.positive() }),
]);
const stroke = z.object({
  paint: solidPaint,
  width: num.min(0),
  cap: z.enum(['butt', 'round', 'square']),
  join: z.enum(['miter', 'round', 'bevel']),
  miterLimit: num.min(1),
  dash: z.array(num.min(0)),
});
const baseShape = {
  id: z.string().min(1),
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: num.min(0).max(1),
  transform: matrix,
};
const style = { fill: paint.nullable(), stroke: stroke.nullable() };
const pathNode = z.object({ x: num, y: num, inX: num, inY: num, outX: num, outY: num });
const subpath = z.object({ nodes: z.array(pathNode), closed: z.boolean() });

const element: z.ZodType<Element> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ ...baseShape, ...style, type: z.literal('rect'), x: num, y: num, w: num, h: num, rx: num.min(0) }),
    z.object({ ...baseShape, ...style, type: z.literal('ellipse'), cx: num, cy: num, rx: num.min(0), ry: num.min(0) }),
    z.object({ ...baseShape, ...style, type: z.literal('path'), nodes: z.array(pathNode), closed: z.boolean(), extra: z.array(subpath), fillRule: z.enum(['nonzero', 'evenodd']) }),
    z.object({ ...baseShape, type: z.literal('group'), children: z.array(element), clip: z.boolean().optional() }),
  ]),
);

const documentSchema = z.object({
  format: z.literal(FORMAT_NAME),
  version: z.number().int().min(1),
  id: z.string().min(1),
  name: z.string(),
  ppi: num.min(1),
  artboards: z
    .array(z.object({ id: z.string().min(1), name: z.string(), x: num, y: num, w: num.positive(), h: num.positive(), background: color.nullable() }))
    .min(1),
  layers: z.array(z.object({ id: z.string().min(1), name: z.string(), visible: z.boolean(), locked: z.boolean(), children: z.array(element) })),
});

function collectIds(els: Element[], seen: Set<string>): void {
  for (const e of els) {
    if (seen.has(e.id)) throw new DocumentFormatError(`Duplicate id "${e.id}"`);
    seen.add(e.id);
    if (e.type === 'group') collectIds(e.children, seen);
  }
}

/** Upgrades older documents to the current version (in a copy). */
function migrate(data: Record<string, unknown>): Record<string, unknown> {
  if (data.version !== 1) return data;
  const copy = structuredClone(data) as { version: number; layers?: { children?: unknown[] }[] };
  const walk = (list: unknown[] | undefined) => {
    for (const e of list ?? []) {
      const el = e as { type?: string; children?: unknown[]; extra?: unknown; fillRule?: unknown };
      if (el && el.type === 'path') { el.extra ??= []; el.fillRule ??= 'nonzero'; }
      if (el && el.type === 'group') walk(el.children);
    }
  };
  if (Array.isArray(copy.layers)) copy.layers.forEach((l) => walk(l?.children));
  copy.version = 2;
  return copy;
}

/** Validates arbitrary data as a VDocument. Throws DocumentFormatError with a readable message. */
export function validateDocument(data: unknown): VDocument {
  if (typeof data !== 'object' || data === null) throw new DocumentFormatError('Not a Vector Studio document');
  const d = data as { format?: unknown; version?: unknown };
  if (d.format !== FORMAT_NAME) throw new DocumentFormatError('Not a Vector Studio document (wrong format marker)');
  if (typeof d.version !== 'number' || d.version > FORMAT_VERSION) {
    throw new DocumentFormatError(`Document version ${String(d.version)} is newer than this app supports (${FORMAT_VERSION})`);
  }
  const res = documentSchema.safeParse(migrate(data as Record<string, unknown>));
  if (!res.success) {
    const issue = res.error.issues[0];
    throw new DocumentFormatError(`Invalid document at "${issue.path.join('.')}": ${issue.message}`);
  }
  const doc = res.data as VDocument;
  const seen = new Set<string>();
  for (const a of doc.artboards) {
    if (seen.has(a.id)) throw new DocumentFormatError(`Duplicate id "${a.id}"`);
    seen.add(a.id);
  }
  for (const l of doc.layers) {
    if (seen.has(l.id)) throw new DocumentFormatError(`Duplicate id "${l.id}"`);
    seen.add(l.id);
    collectIds(l.children, seen);
  }
  return doc;
}

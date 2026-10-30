import type { PathNode, Rect, Vec } from '../core/geometry/types';
import type { Editor } from './editor';

export type ToolId = 'select' | 'direct' | 'rect' | 'ellipse' | 'pen' | 'hand' | 'zoom';

export interface PointerInfo {
  /** Document-space position. */
  p: Vec;
  /** Viewport (CSS px) position. */
  screen: Vec;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  /** Click count (2 = double click). */
  detail: number;
}

export interface Tool {
  id: ToolId;
  label: string;
  shortcut: string;
  cursor(ed: Editor, hover: Vec | null): string;
  down(ed: Editor, e: PointerInfo): void;
  move(ed: Editor, e: PointerInfo): void;
  up(ed: Editor, e: PointerInfo): void;
  /** Called when the tool is switched away from or the gesture is aborted (Esc). */
  cancel?(ed: Editor): void;
  /** Enter / Esc / arrow keys etc. Return true if handled. */
  key?(ed: Editor, key: string, mods: { shift: boolean; alt: boolean; ctrl: boolean }): boolean;
}

export interface OverlayOutline {
  nodes: PathNode[];
  closed: boolean;
}
export interface OverlayAnchor {
  x: number;
  y: number;
  selected: boolean;
  hIn: Vec | null;
  hOut: Vec | null;
}
export interface OverlayModel {
  outlines: OverlayOutline[];
  /** Selection bounds with transform handles (select tool only). */
  bbox: Rect | null;
  anchors: OverlayAnchor[][];
  marquee: Rect | null;
  /** Pen tool in-progress path (world space) and the rubber-band target. */
  pen: { nodes: PathNode[]; closed: boolean; cursor: Vec | null } | null;
  /** Live shape-creation preview. */
  rubber: Rect | null;
}

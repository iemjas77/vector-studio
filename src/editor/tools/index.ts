import type { Tool, ToolId } from '../types';
import { directTool } from './direct';
import { handTool, zoomTool } from './view';
import { ellipseTool, rectTool } from './shapes';
import { penTool } from './pen';
import { selectTool } from './select';
import { textTool } from './text';

export function createTools(): Record<ToolId, Tool> {
  return {
    select: selectTool(),
    direct: directTool(),
    rect: rectTool(),
    ellipse: ellipseTool(),
    pen: penTool(),
    text: textTool(),
    hand: handTool(),
    zoom: zoomTool(),
  };
}

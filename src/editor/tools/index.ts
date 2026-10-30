import type { Tool, ToolId } from '../types';
import { directTool } from './direct';
import { handTool, zoomTool } from './view';
import { ellipseTool, rectTool } from './shapes';
import { penTool } from './pen';
import { selectTool } from './select';
import { arcTool, lineTool, pencilTool, polygonTool, roundedRectTool, spiralTool, starTool } from './draw';
import { artboardTool, eyedropperTool, gradientTool, lassoTool, wandTool } from './pick';
import { textTool } from './text';

export function createTools(): Record<ToolId, Tool> {
  return {
    select: selectTool(),
    direct: directTool(),
    wand: wandTool(),
    lasso: lassoTool(),
    pencil: pencilTool(),
    rrect: roundedRectTool(),
    polygon: polygonTool(),
    star: starTool(),
    line: lineTool(),
    arc: arcTool(),
    spiral: spiralTool(),
    eyedropper: eyedropperTool(),
    gradient: gradientTool(),
    artboard: artboardTool(),
    rect: rectTool(),
    ellipse: ellipseTool(),
    pen: penTool(),
    text: textTool(),
    hand: handTool(),
    zoom: zoomTool(),
  };
}

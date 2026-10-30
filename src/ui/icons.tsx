import type { ToolId } from '../editor/types';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function ToolIcon({ id }: { id: ToolId }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...P} aria-hidden="true">
      {id === 'select' && <path d="M6 3l12 9-5.5 1 3.5 6.5-2.5 1.2-3.5-6.5L6 18z" fill="currentColor" />}
      {id === 'direct' && <path d="M6 3l12 9-5.5 1 3.5 6.5-2.5 1.2-3.5-6.5L6 18z" />}
      {id === 'rect' && <rect x="4" y="6" width="16" height="12" rx="1" />}
      {id === 'ellipse' && <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />}
      {id === 'pen' && <><path d="M12 3l5 6-3 8-4 1-2-2 1-4z" /><path d="M10 18l-4 3" /><circle cx="12" cy="11" r="1.2" /></>}
      {id === 'text' && <path d="M5 6V4h14v2M12 4v16M9 20h6" />}
      {id === 'wand' && <><path d="M5 19L15 9" /><path d="M16 4v3M16 11v3M12 7.5h3M17.5 7.5H21M13.2 4.7l1.4 1.4M19 10.4l-1.4-1.4" /></>}
      {id === 'lasso' && <><path d="M12 5c4.5 0 8 1.8 8 4s-3.5 4-8 4-8-1.8-8-4 3.5-4 8-4z" strokeDasharray="2 2" /><path d="M9 13c-1 3 0 5 3 6" /></>}
      {id === 'pencil' && <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />}
      {id === 'rrect' && <rect x="4" y="6" width="16" height="12" rx="5" />}
      {id === 'polygon' && <path d="M12 3l8 6-3 10H7L4 9z" />}
      {id === 'star' && <path d="M12 3l2.6 6 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.2 1.4-6.3L3 9.6 9.4 9z" />}
      {id === 'line' && <path d="M5 19L19 5" />}
      {id === 'arc' && <path d="M5 19c0-8 5-14 14-14" />}
      {id === 'spiral' && <path d="M12 12c1-1 2 0 2 1s-1 3-3 3-4-2-4-4 3-6 6-6 7 3 7 7-4 8-9 8" />}
      {id === 'eyedropper' && <path d="M15 4l5 5-3 1-1 1-8 8-4 1 1-4 8-8 1-1zM13 6l5 5" />}
      {id === 'gradient' && <><rect x="4" y="5" width="16" height="14" rx="1" /><path d="M4 12h16M4 8.5h16M4 15.5h16" strokeOpacity=".5" /></>}
      {id === 'artboard' && <><path d="M7 3v4M3 7h4M17 21v-4M21 17h-4" /><rect x="7" y="7" width="10" height="10" /></>}
      {id === 'hand' && <path d="M8 12V6a1.5 1.5 0 013 0v5m0-6.5a1.5 1.5 0 013 0V11m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a5 5 0 01-4-2l-3-4a1.5 1.5 0 012.3-1.9L8 15" />}
      {id === 'zoom' && <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5M10.5 8v5M8 10.5h5" /></>}
    </svg>
  );
}

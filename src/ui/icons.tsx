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
      {id === 'hand' && <path d="M8 12V6a1.5 1.5 0 013 0v5m0-6.5a1.5 1.5 0 013 0V11m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a5 5 0 01-4-2l-3-4a1.5 1.5 0 012.3-1.9L8 15" />}
      {id === 'zoom' && <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5M10.5 8v5M8 10.5h5" /></>}
    </svg>
  );
}

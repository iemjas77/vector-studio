import { closeTab } from './commands';
import { useApp } from './hooks';

export function DocTabs() {
  const app = useApp();
  const { ws } = app;
  return (
    <div className="flex bg-bg border-b border-edge overflow-x-auto" style={{ height: 28 }} role="tablist" data-testid="doc-tabs">
      {ws.editors.map((e, i) => (
        <div
          key={i} role="tab" aria-selected={i === ws.active} data-testid={`tab-${i}`}
          className="row px-3 cursor-pointer border-r border-edge"
          style={{ background: i === ws.active ? '#2a2a2a' : '#1e1e1e', borderTop: i === ws.active ? '2px solid #4d9cff' : '2px solid transparent', whiteSpace: 'nowrap' }}
          onClick={() => ws.activate(i)}
        >
          <span>{e.fileName ?? e.doc.name}{e.history.dirty ? ' •' : ''}</span>
          <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label="Close tab" onClick={(ev) => { ev.stopPropagation(); closeTab(app, i); }}>×</button>
        </div>
      ))}
    </div>
  );
}

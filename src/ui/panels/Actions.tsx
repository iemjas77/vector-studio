import { useEffect, useState, useSyncExternalStore } from 'react';
import { describeStep, STEPS, STEP_TEMPLATES } from '../../automation/steps';
import { validateAction } from '../../automation/library';
import { platform } from '../../platform';
import { actions } from '../actions-service';
import { COMMANDS } from '../commands';
import { useApp } from '../hooks';
import { useUi } from '../store';

const useActionsVersion = () => useSyncExternalStore((f) => actions.subscribe(f), () => actions.version);

export function ActionsPanel() {
  const app = useApp();
  useActionsVersion();
  const lib = actions.library;
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [json, setJson] = useState('');
  const [err, setErr] = useState('');
  const [insertType, setInsertType] = useState('selectAll');
  useEffect(() => { if (sel && !lib.find(sel)) setSel(null); });
  const found = sel ? lib.find(sel) : null;
  const action = found?.action ?? null;
  const p = actions.play;
  const rec = actions.recording;
  const busy = p.running;
  const guard = (fn: () => void) => { try { setErr(''); fn(); } catch (e) { setErr((e as Error).message); } };
  const issues = action ? validateAction(action) : [];

  return (
    <div className="flex flex-col gap-2" data-testid="actions-panel">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn" data-testid="act-record" disabled={!action || busy || rec} title="Record the commands you use into the selected action" onClick={() => action && actions.startRecording(action.id)}>● Record</button>
        <button className="btn" data-testid="act-pause-rec" disabled={!rec} onClick={() => (actions.recorder.paused ? actions.resumeRecording() : actions.pauseRecording())}>{actions.recorder.paused ? '▶ Resume rec.' : '⏸ Pause rec.'}</button>
        <button className="btn" data-testid="act-stop-rec" disabled={!rec} onClick={() => actions.stopRecording()}>■ Stop rec.</button>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-primary" data-testid="act-play" disabled={!action || busy || rec} onClick={() => action && void actions.run(app.ed, action)}>▶ Play</button>
        <button className="btn" data-testid="act-step" disabled={!action || rec || (busy && !p.paused)} onClick={() => { if (!busy && action) void actions.run(app.ed, action, 'step'); else actions.stepPlayback(); }}>⏭ Step</button>
        <button className="btn" data-testid="act-pause" disabled={!busy} onClick={() => (p.paused ? actions.resumePlayback() : actions.pausePlayback())}>{p.paused ? '▶ Resume' : '⏸ Pause'}</button>
        <button className="btn" data-testid="act-stop" disabled={!busy} onClick={() => actions.stopPlayback()}>■ Stop</button>
        <button className="btn" data-testid="act-undo" disabled={busy || !p.result || p.result.undoEntries === 0} title="Undo all changes made by the last run" onClick={() => actions.undoLastRun()}>↶ Undo run</button>
      </div>
      {(busy || p.message) && (
        <div data-testid="act-status" style={{ color: p.result?.status === 'failed' ? '#ff9a9a' : '#9a9a9a' }}>
          {busy && <div style={{ height: 6, background: '#1b1b1b', border: '1px solid #444' }}><div data-testid="act-progress" style={{ height: '100%', width: `${p.total ? (p.index / p.total) * 100 : 0}%`, background: '#4d9cff' }} /></div>}
          {busy ? `${p.paused ? 'Paused – ' : ''}Step ${Math.min(p.index + 1, p.total)} of ${p.total}: ${p.stepLabel}` : p.message}
        </div>
      )}
      {err && <div style={{ color: '#ff9a9a' }} data-testid="act-error">{err}</div>}

      <div className="border border-edge" style={{ maxHeight: 150, overflow: 'auto', background: '#262626' }} data-testid="act-list">
        {lib.sets.map((set) => (
          <div key={set.id}>
            <div className="layer-row" style={{ background: '#303030', fontWeight: 600 }}>
              {editing === set.id ? <input autoFocus type="text" defaultValue={set.name} data-testid="act-rename-input" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { guard(() => lib.rename(set.id, e.currentTarget.value)); setEditing(null); } if (e.key === 'Escape') setEditing(null); }} onBlur={() => setEditing(null)} />
                : <span style={{ flex: 1 }} onDoubleClick={() => setEditing(set.id)} data-testid={`set-${set.name}`}>📁 {set.name}</span>}
              <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label="Delete set" onClick={() => { if (window.confirm(`Delete set "${set.name}" and its ${set.actions.length} action(s)?`)) lib.deleteSet(set.id); }}>×</button>
            </div>
            {set.actions.map((a) => (
              <div key={a.id} className={`layer-row ${a.id === sel ? 'sel' : ''}`} style={{ paddingLeft: 18 }} data-testid={`action-${a.name}`} onClick={() => setSel(a.id)}>
                {editing === a.id ? <input autoFocus type="text" defaultValue={a.name} data-testid="act-rename-input" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { guard(() => lib.rename(a.id, e.currentTarget.value)); setEditing(null); } if (e.key === 'Escape') setEditing(null); }} onBlur={() => setEditing(null)} />
                  : <span style={{ flex: 1 }} onDoubleClick={() => setEditing(a.id)}>{a.name}</span>}
                <span className="text-mute">{a.shortcut ?? ''}</span>
                <span className="text-mute">{a.steps.length}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn" data-testid="act-new" onClick={() => { const a = lib.createAction(found?.set.id ?? null, `Action ${lib.sets.flatMap((s) => s.actions).length + 1}`); setSel(a.id); }}>+ Action</button>
        <button className="btn" data-testid="act-new-set" onClick={() => lib.createSet(`Set ${lib.sets.length + 1}`)}>+ Set</button>
        <button className="btn" data-testid="act-dup" disabled={!action} onClick={() => action && setSel(lib.duplicateAction(action.id).id)}>Duplicate</button>
        <button className="btn" data-testid="act-del" disabled={!action || busy} onClick={() => { if (action && window.confirm(`Delete action "${action.name}"?`)) lib.deleteAction(action.id); }}>Delete</button>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn" data-testid="act-export" disabled={!found} onClick={async () => { if (found) await platform.saveFile({ suggestedName: found.set.name, ext: 'vsactions', data: lib.toJSON(found.set.id), mime: 'application/json', forceDialog: true }); }}>Export set…</button>
        <button className="btn" data-testid="act-import" onClick={async () => {
          const f = await platform.openTextFile(['.vsactions', '.json']);
          if (!f) return;
          guard(() => { const n = lib.importSets(f.text); useUi.getState().notify(`Imported ${n.length} action set(s) from ${f.name}`); });
        }}>Import set…</button>
        <span className="row" style={{ gap: 3 }}><span className="text-mute">Shortcut</span>
          <input type="text" data-testid="act-shortcut" aria-label="Action shortcut" style={{ width: 96 }} placeholder="Ctrl+Shift+1" disabled={!action} key={action?.id + String(action?.shortcut)} defaultValue={action?.shortcut ?? ''}
            onKeyDown={(e) => e.stopPropagation()} onBlur={(e) => action && guard(() => { const v = e.target.value.trim(); const clash = COMMANDS.find((c) => c.shortcut && c.shortcut.toLowerCase() === v.toLowerCase()); if (v && clash) throw new Error(`${v} is already used by the built-in command "${clash.label}"`); lib.setShortcut(action.id, v || undefined); })} /></span>
      </div>

      {action && (
        <>
          <div className="text-mute">Steps of “{action.name}”{rec ? ' – RECORDING' : ''}</div>
          <div className="border border-edge" style={{ maxHeight: 190, overflow: 'auto', background: '#262626' }} data-testid="act-steps">
            {action.steps.length === 0 && <div className="px-2 py-1 text-mute">No steps yet. Press Record and use menus, panels and tools, or insert a step below.</div>}
            {action.steps.map((s, i) => {
              const bad = issues.find((x) => x.step === s.id);
              return (
                <div key={s.id} className="layer-row" data-testid={`step-${i}`} style={{ opacity: s.enabled ? 1 : 0.5, borderLeft: bad ? `3px solid ${bad.level === 'error' ? '#ff6b6b' : '#e0b341'}` : undefined }} title={bad?.text}>
                  <input type="checkbox" aria-label={`Enable step ${i + 1}`} data-testid={`step-enable-${i}`} checked={s.enabled} onChange={() => lib.toggleStep(action.id, s.id)} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid={`step-label-${i}`}>{describeStep(s)}</span>
                  <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label="Move step up" disabled={i === 0} onClick={() => lib.moveStep(action.id, s.id, i - 1)}>↑</button>
                  <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label="Move step down" disabled={i === action.steps.length - 1} onClick={() => lib.moveStep(action.id, s.id, i + 1)}>↓</button>
                  <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label="Edit step parameters" data-testid={`step-edit-${i}`} onClick={() => { setEditing(s.id); setJson(JSON.stringify(s.params, null, 1)); }}>✎</button>
                  <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label="Delete step" data-testid={`step-del-${i}`} onClick={() => lib.deleteStep(action.id, s.id)}>×</button>
                </div>
              );
            })}
          </div>
          {editing && action.steps.some((s) => s.id === editing) && (
            <div className="flex flex-col gap-1" data-testid="step-editor">
              <textarea rows={4} data-testid="step-json" value={json} onChange={(e) => setJson(e.target.value)} onKeyDown={(e) => e.stopPropagation()} style={{ background: '#1b1b1b', border: '1px solid #3d3d3d', color: 'inherit', fontFamily: 'monospace', userSelect: 'text' }} />
              <div className="row"><button className="btn btn-primary" data-testid="step-save" onClick={() => guard(() => { lib.updateStep(action.id, editing, JSON.parse(json)); setEditing(null); })}>Apply</button><button className="btn" onClick={() => setEditing(null)}>Cancel</button></div>
            </div>
          )}
          <div className="row">
            <select data-testid="act-insert-type" value={insertType} onChange={(e) => setInsertType(e.target.value)} style={{ flex: 1 }}>{STEPS.map((s) => <option key={s.type} value={s.type}>{s.label}</option>)}</select>
            <button className="btn" data-testid="act-insert" onClick={() => guard(() => lib.addStep(action.id, insertType, STEP_TEMPLATES[insertType] ?? {}))}>Insert step</button>
          </div>
          {issues.length > 0 && <ul data-testid="act-issues" style={{ margin: 0, paddingLeft: 16, color: '#e0b341' }}>{issues.slice(0, 4).map((i, k) => <li key={k} style={{ color: i.level === 'error' ? '#ff9a9a' : '#e0b341' }}>{i.text}</li>)}</ul>}
        </>
      )}
      <div className="row"><button className="btn" data-testid="act-batch" disabled={!action} onClick={() => { useUi.getState().setBatchAction(action?.id ?? null); useUi.getState().openDialog('batchActions'); }}>Batch process files…</button></div>
    </div>
  );
}

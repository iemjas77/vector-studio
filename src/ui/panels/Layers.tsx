import { useState } from 'react';
import type { Element, Layer } from '../../core/document';
import type { Editor } from '../../editor/editor';
import { useApp } from '../hooks';

const MAX_ROWS = 300;
const TYPE_GLYPH: Record<Element['type'], string> = { rect: '▭', ellipse: '◯', path: '✎', group: '▣' };

function EditableName({ value, onCommit, testId }: { value: string; onCommit(v: string): void; testId?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  if (!editing) {
    return <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid={testId}
      onDoubleClick={(e) => { e.stopPropagation(); setText(value); setEditing(true); }}>{value}</span>;
  }
  const done = (ok: boolean) => { setEditing(false); if (ok && text.trim() && text !== value) onCommit(text.trim()); };
  return <input autoFocus type="text" value={text} style={{ flex: 1 }} data-testid={testId ? `${testId}-input` : undefined}
    onChange={(e) => setText(e.target.value)} onBlur={() => done(true)} onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }} />;
}

function ElementRow({ ed, el, depth, layer, index, expanded, toggle }: {
  ed: Editor; el: Element; depth: number; layer: Layer; index: number; expanded: Set<string>; toggle(id: string): void;
}) {
  const [drop, setDrop] = useState<'above' | 'below' | null>(null);
  const selected = ed.selection.includes(el.id);
  const topLevel = depth === 1;
  return (
    <>
      <div
        className={`layer-row ${selected ? 'sel' : ''} ${drop === 'above' ? 'drop-above' : ''}`} data-testid={`el-row-${el.id}`}
        style={{ paddingLeft: 6 + depth * 14, opacity: el.visible && layer.visible ? 1 : 0.5 }}
        draggable={topLevel}
        onDragStart={(e) => { e.dataTransfer.setData('application/x-vs-el', el.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => { if (topLevel && e.dataTransfer.types.includes('application/x-vs-el')) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDrop(e.clientY < r.top + r.height / 2 ? 'above' : 'below'); } }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          setDrop(null);
          const id = e.dataTransfer.getData('application/x-vs-el');
          if (!id || !topLevel || id === el.id) return;
          e.preventDefault();
          // Rows are displayed top-most first, so "above" means a higher index.
          ed.moveElementTo(id, layer.id, drop === 'above' ? index + 1 : index);
        }}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) ed.toggleSelect(el.id); else ed.select([el.id]);
        }}
      >
        {el.type === 'group'
          ? <button className="icon-btn" style={{ width: 14, height: 14 }} aria-label="Expand group" onClick={(e) => { e.stopPropagation(); toggle(el.id); }}>{expanded.has(el.id) ? '▾' : '▸'}</button>
          : <span style={{ width: 14 }} />}
        <span className="text-mute" aria-hidden>{TYPE_GLYPH[el.type]}</span>
        <EditableName value={el.name} testId={`el-name-${el.id}`} onCommit={(v) => ed.patchElement(el.id, { name: v })} />
        <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label={el.visible ? 'Hide object' : 'Show object'} aria-pressed={!el.visible} data-testid={`el-vis-${el.id}`}
          onClick={(e) => { e.stopPropagation(); ed.patchElement(el.id, { visible: !el.visible }); }}>{el.visible ? '👁' : '—'}</button>
        <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label={el.locked ? 'Unlock object' : 'Lock object'} aria-pressed={el.locked} data-testid={`el-lock-${el.id}`}
          onClick={(e) => { e.stopPropagation(); ed.patchElement(el.id, { locked: !el.locked }); }}>{el.locked ? '🔒' : '·'}</button>
      </div>
      {el.type === 'group' && expanded.has(el.id) && [...el.children].reverse().slice(0, MAX_ROWS).map((c, i) => (
        <ElementRow key={c.id} ed={ed} el={c} depth={depth + 1} layer={layer} index={el.children.length - 1 - i} expanded={expanded} toggle={toggle} />
      ))}
    </>
  );
}

export function LayersPanel() {
  const { ed } = useApp();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [closedLayers, setClosedLayers] = useState<Set<string>>(new Set());
  const [layerDrop, setLayerDrop] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const doc = ed.doc;
  const layersTopFirst = [...doc.layers].reverse();

  return (
    <div className="flex flex-col" data-testid="layers-panel">
      <div className="border border-edge" style={{ maxHeight: 280, overflow: 'auto', background: '#262626' }}>
        {layersTopFirst.map((layer) => {
          const idx = doc.layers.indexOf(layer);
          const open = !closedLayers.has(layer.id);
          return (
            <div key={layer.id}>
              <div
                className={`layer-row ${layer.id === ed.activeLayerId ? 'sel' : ''} ${layerDrop === layer.id ? 'drop-into' : ''}`} data-testid={`layer-row-${idx}`}
                style={{ background: layer.id === ed.activeLayerId ? '#35507a' : '#303030', fontWeight: 600 }}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('application/x-vs-layer', layer.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-vs-el') || e.dataTransfer.types.includes('application/x-vs-layer')) { e.preventDefault(); setLayerDrop(layer.id); } }}
                onDragLeave={() => setLayerDrop(null)}
                onDrop={(e) => {
                  setLayerDrop(null);
                  const el = e.dataTransfer.getData('application/x-vs-el');
                  const ly = e.dataTransfer.getData('application/x-vs-layer');
                  e.preventDefault();
                  if (el) ed.moveElementTo(el, layer.id, layer.children.length);
                  else if (ly && ly !== layer.id) ed.moveLayer(ly, idx);
                }}
                onClick={() => { ed.activeLayerId = layer.id; ed.emit(); }}
              >
                <button className="icon-btn" style={{ width: 14, height: 14 }} aria-label="Collapse layer" onClick={(e) => { e.stopPropagation(); setClosedLayers((s) => { const n = new Set(s); if (n.has(layer.id)) n.delete(layer.id); else n.add(layer.id); return n; }); }}>{open ? '▾' : '▸'}</button>
                <EditableName value={layer.name} testId={`layer-name-${idx}`} onCommit={(v) => ed.patchLayer(layer.id, { name: v })} />
                <span className="text-mute">{layer.children.length}</span>
                <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label={layer.visible ? 'Hide layer' : 'Show layer'} aria-pressed={!layer.visible} data-testid={`layer-vis-${idx}`}
                  onClick={(e) => { e.stopPropagation(); ed.patchLayer(layer.id, { visible: !layer.visible }); }}>{layer.visible ? '👁' : '—'}</button>
                <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'} aria-pressed={layer.locked} data-testid={`layer-lock-${idx}`}
                  onClick={(e) => { e.stopPropagation(); ed.patchLayer(layer.id, { locked: !layer.locked }); }}>{layer.locked ? '🔒' : '·'}</button>
              </div>
              {open && [...layer.children].reverse().slice(0, MAX_ROWS).map((el, i) => (
                <ElementRow key={el.id} ed={ed} el={el} depth={1} layer={layer} index={layer.children.length - 1 - i} expanded={expanded} toggle={toggle} />
              ))}
              {open && layer.children.length > MAX_ROWS && <div className="text-mute px-3 py-1">… {layer.children.length - MAX_ROWS} more objects</div>}
            </div>
          );
        })}
      </div>
      <div className="row mt-2">
        <button className="btn" data-testid="layer-add" onClick={() => ed.addLayer()}>+ Layer</button>
        <button className="btn" data-testid="layer-delete" disabled={doc.layers.length < 2} onClick={() => ed.removeLayer(ed.activeLayerId)}>Delete layer</button>
        <button className="btn" data-testid="layer-up" title="Move layer up" onClick={() => { const i = doc.layers.findIndex((l) => l.id === ed.activeLayerId); ed.moveLayer(ed.activeLayerId, i + 1); }}>▲</button>
        <button className="btn" data-testid="layer-down" title="Move layer down" onClick={() => { const i = doc.layers.findIndex((l) => l.id === ed.activeLayerId); ed.moveLayer(ed.activeLayerId, i - 1); }}>▼</button>
      </div>
    </div>
  );
}

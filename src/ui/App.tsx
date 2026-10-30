import { useEffect, useMemo } from 'react';
import { AppContext, useApp } from './hooks';
import { commandForKey, parseShortcut, type App as AppApi } from './commands';
import { Workspace } from './workspace';
import { MenuBar } from './MenuBar';
import { DocTabs } from './DocTabs';
import { OptionsBar } from './OptionsBar';
import { Toolbar } from './Toolbar';
import { CanvasView } from './CanvasView';
import { StatusBar } from './StatusBar';
import { Section } from './controls';
import { PropertiesPanel } from './panels/Properties';
import { ColorPanel } from './panels/Color';
import { StrokePanel } from './panels/Stroke';
import { LayersPanel } from './panels/Layers';
import { AlignPanel } from './panels/Align';
import { AppearancePanel, TransparencyPanel } from './panels/Appearance';
import { DocumentInfoPanel, PathfinderPanel, TransformPanel } from './panels/Panels2';
import { ActionsPanel } from './panels/Actions';
import { actions } from './actions-service';
import { TypographyPanel } from './panels/Typography';
import { ArtboardsPanel } from './panels/Artboards';
import { AboutDialog, ExportPngDialog, NewDocumentDialog, ShortcutsDialog } from './dialogs/Dialogs';
import { useUi } from './store';
import { BatchActionsDialog, BatchDialog, OffsetDialog, CleanupDialog, ColorsDialog, TraceDialog } from './dialogs/ToolDialogs';
import { platform } from '../platform';
import { bootFonts } from './fonts-boot';
import { listPlugins, podToolsPlugin, registerPlugin } from '../automation/plugin';

// Built-in plugins are registered once at load so the Plugins menu exists from the first render.
if (!listPlugins().some((p) => p.id === podToolsPlugin.id)) registerPlugin(podToolsPlugin);

const PANELS = [
  { id: 'properties', title: 'Properties', el: <PropertiesPanel /> },
  { id: 'appearance', title: 'Appearance', el: <AppearancePanel /> },
  { id: 'transparency', title: 'Transparency', el: <TransparencyPanel /> },
  { id: 'color', title: 'Color', el: <ColorPanel /> },
  { id: 'stroke', title: 'Stroke', el: <StrokePanel /> },
  { id: 'typography', title: 'Typography', el: <TypographyPanel /> },
  { id: 'pathfinder', title: 'Pathfinder', el: <PathfinderPanel /> },
  { id: 'transform', title: 'Transform', el: <TransformPanel /> },
  { id: 'align', title: 'Align', el: <AlignPanel /> },
  { id: 'docinfo', title: 'Document Info', el: <DocumentInfoPanel /> },
  { id: 'actions', title: 'Actions', el: <ActionsPanel /> },
  { id: 'layers', title: 'Layers', el: <LayersPanel /> },
  { id: 'artboards', title: 'Artboards', el: <ArtboardsPanel /> },
];

export function App() {
  const ws = useMemo(() => new Workspace(), []);
  const api = useMemo<AppApi>(() => ({ ws, get ed() { return ws.current; } }), [ws]);

  useEffect(() => {
    const ready = bootFonts(() => ws.editors.forEach((e) => e.emit()));
    (window as unknown as { __vsFontsReady: Promise<void> }).__vsFontsReady = ready;
  }, [ws]);

  useEffect(() => {
    // Read-only inspection hook used by the end-to-end tests.
    (window as unknown as { __vs: unknown }).__vs = { workspace: ws };
    (window as unknown as { __vsActions: unknown }).__vsActions = actions;
  }, [ws]);

  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (useUi.getState().dialog) {
        if (e.key === 'Escape') useUi.getState().openDialog(null);
        return;
      }
      if (isTyping(e.target) && !(e.target as HTMLInputElement).type?.match?.(/color|checkbox/)) return;
      const ed = ws.current;
      const mods = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey };
      if (e.code === 'Space' && !e.repeat) { useUi.getState().setSpace(true); e.preventDefault(); return; }
      if (e.code === 'Space') { e.preventDefault(); return; }
      const c = commandForKey(e);
      if (c) {
        if (c.enabled && !c.enabled(api)) { e.preventDefault(); return; }
        e.preventDefault();
        void c.run(api);
        return;
      }
      if (!e.repeat) {
        const act = actions.findByShortcut((spec) => { const s = parseShortcut(spec); const ctrl = e.ctrlKey || e.metaKey; const k = e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key.toLowerCase(); return s.key === k && s.ctrl === ctrl && s.shift === e.shiftKey && s.alt === e.altKey; });
        if (act) { e.preventDefault(); void actions.run(ed, act); return; }
      }
      if (mods.ctrl) return;
      if (e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]!;
        ed.nudge(d[0], d[1]);
        e.preventDefault();
        return;
      }
      if (ed.toolKey(e.key, mods)) { e.preventDefault(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { ed.deleteSelection(); e.preventDefault(); return; }
      if (e.key === 'Escape') { if (ed.dragging || ed.history.inTransaction) ed.cancelGesture(); else if (ed.selection.length) ed.clearSelection(); else if (ed.isolation) ed.exitIsolation(); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') useUi.getState().setSpace(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const blur = () => useUi.getState().setSpace(false);
    window.addEventListener('blur', blur);
    const before = (e: BeforeUnloadEvent) => { if (platform.kind === 'browser' && ws.anyDirty) { e.preventDefault(); } };
    window.addEventListener('beforeunload', before);
    platform.onCloseRequest?.(async () => {
      if (!ws.anyDirty) return true;
      return window.confirm('You have unsaved changes. Close without saving?');
    });
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('beforeunload', before);
    };
  }, [ws, api]);

  return (
    <AppContext.Provider value={api}>
      <Shell />
    </AppContext.Provider>
  );
}

function Shell() {
  const app = useApp();
  const dialog = useUi((s) => s.dialog);
  const toast = useUi((s) => s.toast);
  const warnings = useUi((s) => s.warnings);
  const setWarnings = useUi((s) => s.setWarnings);
  const collapsed = useUi((s) => s.collapsed);
  const toggle = useUi((s) => s.toggleSection);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => { if (useUi.getState().toast?.id === toast.id) useUi.setState({ toast: null }); }, toast.kind === 'error' ? 8000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <MenuBar />
      <DocTabs />
      <OptionsBar />
      <div className="flex flex-1 min-h-0">
        <Toolbar />
        <CanvasView key={app.ws.active} />
        <aside className="bg-panel border-l border-edge overflow-y-auto" style={{ width: 292 }} data-testid="panels">
          {PANELS.map((p) => <Section key={p.id} id={p.id} title={p.title} collapsed={!!collapsed[p.id]} onToggle={() => toggle(p.id)}>{p.el}</Section>)}
        </aside>
      </div>
      <StatusBar />
      {warnings.length > 0 && (
        <div className="dialog" style={{ position: 'fixed', right: 304, bottom: 34, minWidth: 320, maxWidth: 420, zIndex: 80, padding: 10 }} data-testid="import-warnings" role="alert">
          <div className="row" style={{ justifyContent: 'space-between' }}><b>Import notes</b><button className="btn" onClick={() => setWarnings([])}>Dismiss</button></div>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {toast && <div className={`toast ${toast.kind}`} role="status" data-testid="toast">{toast.text}</div>}
      {dialog === 'new' && <NewDocumentDialog />}
      {dialog === 'export' && <ExportPngDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {dialog === 'about' && <AboutDialog />}
      {dialog === 'cleanup' && <CleanupDialog />}
      {dialog === 'colors' && <ColorsDialog />}
      {dialog === 'trace' && <TraceDialog />}
      {dialog === 'batch' && <BatchDialog />}
      {dialog === 'offset' && <OffsetDialog />}
      {dialog === 'batchActions' && <BatchActionsDialog />}
    </div>
  );
}

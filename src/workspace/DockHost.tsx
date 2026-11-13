import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Actions, Layout, Model, TabNode, TabSetNode, type Action, type BorderNode, type ITabRenderValues, type ITabSetRenderValues } from 'flexlayout-react';
import { Check, ExternalLink, Maximize2, Minimize2, MoreHorizontal, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PanelChromeContext } from '@/components/ui/Panel';
import { useMarketStore } from '@/stores/useMarketStore';
import { REGISTRY } from './registry';
import { WindowContext } from './WindowContext';
import { useWorkspaceStore } from './useWorkspaceStore';
import { symbolOf, useLinkStore } from './useLinkStore';
import { withDockGlobal, WINDOW_TITLES } from './layoutModel';
import { dockModels } from './dockModels';
import { PopMenu } from './PopMenu';
import { LINK_COLORS, type LinkColor, type Scope } from './types';
import 'flexlayout-react/style/dark.css';
import './dock.css';

const ICONS = {
  close: <X size={11} />,
  closeTabset: <X size={13} />,
  more: <MoreHorizontal size={14} />,
};

export const LINK_LABEL: Record<LinkColor, string> = { red: 'Red', blue: 'Blue', green: 'Green', amber: 'Amber' };

/**
 * The docked workspace: windows tile edge to edge with 4px splitters; drag a window's tab to
 * another window's centre to stack it, or to an edge to split. Each stack's header carries the
 * window tabs, then maximize, pop-out and the window menu (link group, close).
 */
export function DockHost({ scope }: { scope: Scope }) {
  const ws = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.active[scope]));
  const wsId = ws?.id ?? '';
  const rev = ws?.rev ?? 0;
  // Rebuilt only when the tab changes or its tree is replaced from outside (load, reset).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => (ws ? Model.fromJson(withDockGlobal(ws.dock)) : null), [wsId, rev]);
  useEffect(() => {
    if (!model) return;
    dockModels.set(wsId, model);
    return () => dockModels.delete(wsId, model);
  }, [wsId, model]);

  // Esc restores a maximized window (menus consume their own Esc first).
  useEffect(() => {
    if (!model) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const max = model.getMaximizedTabset();
      if (max) model.doAction(Actions.maximizeToggle(max.getId()));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [model]);

  const factory = useCallback((node: TabNode) => <WindowFrame wsId={wsId} winId={node.getId()} />, [wsId]);
  const onAction = useCallback((a: Action) => {
    // Selecting a tab focuses that window (and streams its symbol).
    if (a.type === Actions.SELECT_TAB) queueMicrotask(() => useWorkspaceStore.getState().focusWindow(a.data.tabNode as string));
    return a;
  }, []);

  if (!ws || !model) return <div className="win-empty">Loading workspace…</div>;
  return (
    <div className="dock-host" data-testid="dock" data-workspace={ws.name}>
      <Layout
        key={`${wsId}:${rev}`}
        model={model}
        factory={factory}
        realtimeResize
        popoutURL="/popout.html"
        icons={ICONS}
        onAction={onAction}
        onModelChange={(m) => useWorkspaceStore.getState().setDock(wsId, m.toJson())}
        onRenderTab={(node: TabNode, rv: ITabRenderValues) => {
          rv.leading = <LinkDot wsId={wsId} winId={node.getId()} />;
          rv.content = <TabTitle wsId={wsId} winId={node.getId()} />;
        }}
        onRenderTabSet={(node: TabSetNode | BorderNode, rv: ITabSetRenderValues) => {
          if (!(node instanceof TabSetNode)) return;
          const sel = node.getSelectedNode() as TabNode | undefined;
          rv.buttons.push(<HeaderButtons key="win-buttons" model={model} tabset={node} winId={sel?.getId() ?? null} />);
        }}
      />
    </div>
  );
}

function WindowFrame({ wsId, winId }: { wsId: string; winId: string }) {
  const win = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === wsId)?.windows[winId]);
  const ctx = useMemo(() => ({ wsId, winId }), [wsId, winId]);
  if (!win) return <div className="win-empty">This window is no longer available.</div>;
  const def = REGISTRY[win.type];
  const Body = def.component;
  return (
    <WindowContext.Provider value={ctx}>
      <PanelChromeContext.Provider value="window">
        <div
          className={`win win-${win.type}`}
          data-testid={`win-${win.type}`}
          data-window={winId}
          data-link={win.linkGroup ?? 'none'}
          onPointerDownCapture={() => focusFrame(wsId, winId)}
        >
          <ErrorBoundary variant="inline" label={def.title}>
            <Suspense fallback={<div className="win-empty">Loading…</div>}>
              <Body />
            </Suspense>
          </ErrorBoundary>
        </div>
      </PanelChromeContext.Provider>
    </WindowContext.Provider>
  );
}

/** Click into a window: it becomes the focused window and its stack the active one. */
function focusFrame(wsId: string, winId: string) {
  useWorkspaceStore.getState().focusWindow(winId);
  const m = dockModels.get(wsId);
  const ts = m?.getNodeById(winId)?.getParent();
  if (m && ts instanceof TabSetNode && m.getActiveTabset() !== ts) m.doAction(Actions.setActiveTabset(ts.getId()));
}

function TabTitle({ wsId, winId }: { wsId: string; winId: string }) {
  const win = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === wsId)?.windows[winId]);
  const groups = useLinkStore((s) => s.groups);
  const selected = useMarketStore((s) => s.selected);
  if (!win) return <span className="win-tab-title">{WINDOW_TITLES.monitor}</span>;
  const linkable = REGISTRY[win.type].linkable;
  return (
    <span className="win-tab-title" data-testid="win-tab">
      {WINDOW_TITLES[win.type]}
      {linkable && win.type !== 'monitor' && <span className="win-tab-sym mono">{symbolOf(win, groups, selected)}</span>}
    </span>
  );
}

/** The link group dot; click it for the group menu. */
function LinkDot({ wsId, winId }: { wsId: string; winId: string }) {
  const win = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === wsId)?.windows[winId]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!win || !REGISTRY[win.type].linkable) return null;
  const g = win.linkGroup;
  return (
    <>
      <button
        className={`link-dot ${g ?? 'none'}`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(anchor ? null : e.currentTarget);
        }}
        aria-label={g ? `Linked: ${LINK_LABEL[g]} group` : 'Not linked'}
        title={g ? `Linked to the ${LINK_LABEL[g].toLowerCase()} group: shares its symbol` : 'Not linked: keeps its own symbol'}
        data-testid="link-dot"
      />
      {anchor && (
        <PopMenu anchor={anchor} onClose={() => setAnchor(null)} width={190} testId="link-menu">
          <LinkItems winId={winId} current={g} done={() => setAnchor(null)} />
        </PopMenu>
      )}
    </>
  );
}

function LinkItems({ winId, current, done }: { winId: string; current: LinkColor | null; done: () => void }) {
  const groups = useLinkStore((s) => s.groups);
  const pick = (g: LinkColor | null) => {
    useWorkspaceStore.getState().patchWindow(winId, { linkGroup: g });
    done();
  };
  return (
    <>
      <div className="menu-group">Link group</div>
      <button className={`menu-item ${current == null ? 'hl' : ''}`} role="menuitemradio" aria-checked={current == null} onClick={() => pick(null)} data-testid="link-none">
        <span className="link-dot none static" />
        <span className="grow">Not linked</span>
        {current == null && <Check size={12} />}
      </button>
      {LINK_COLORS.map((c) => (
        <button key={c} className={`menu-item ${current === c ? 'hl' : ''}`} role="menuitemradio" aria-checked={current === c} onClick={() => pick(c)} data-testid={`link-${c}`}>
          <span className={`link-dot ${c} static`} />
          <span className="grow">{LINK_LABEL[c]}</span>
          <span className="mono faint">{groups[c]}</span>
          {current === c && <Check size={12} />}
        </button>
      ))}
    </>
  );
}

function HeaderButtons({ model, tabset, winId }: { model: Model; tabset: TabSetNode; winId: string | null }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const win = useWorkspaceStore((s) => (winId ? s.workspaces.find((w) => w.windows[winId])?.windows[winId] : undefined));
  const max = tabset.isMaximized();
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const btn = (label: string, icon: ReactNode, onClick: (el: HTMLElement) => void, testId: string, pressed?: boolean) => (
    <button className="win-btn" onPointerDown={stop} onMouseDown={stop} onClick={(e) => onClick(e.currentTarget)} aria-label={label} title={label} aria-pressed={pressed} data-testid={testId}>
      {icon}
    </button>
  );
  return (
    <span className="win-btns">
      {btn(max ? 'Restore window (Esc)' : 'Maximize window', max ? <Minimize2 size={13} /> : <Maximize2 size={13} />, () => model.doAction(Actions.maximizeToggle(tabset.getId())), 'win-maximize', max)}
      {winId && btn('Pop out to a new browser window', <ExternalLink size={13} />, () => model.doAction(Actions.popoutTab(winId)), 'win-popout')}
      {btn('Window menu', <MoreHorizontal size={14} />, (el) => setAnchor(anchor ? null : el), 'win-menu')}
      {anchor && win && (
        <PopMenu anchor={anchor} onClose={() => setAnchor(null)} width={210} align="right" testId="win-menu-panel">
          {REGISTRY[win.type].linkable && <LinkItems winId={win.id} current={win.linkGroup} done={() => setAnchor(null)} />}
          {REGISTRY[win.type].linkable && <div className="divider" />}
          <button
            className="menu-item"
            onClick={() => {
              setAnchor(null);
              model.doAction(Actions.maximizeToggle(tabset.getId()));
            }}
          >
            {max ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="grow">{max ? 'Restore' : 'Maximize'}</span>
            {max && <kbd className="cm-kbd">Esc</kbd>}
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setAnchor(null);
              model.doAction(Actions.popoutTab(win.id));
            }}
          >
            <ExternalLink size={14} /> <span className="grow">Pop out</span>
          </button>
          <button
            className="menu-item danger"
            onClick={() => {
              setAnchor(null);
              model.doAction(Actions.deleteTab(win.id));
            }}
            data-testid="win-close"
          >
            <X size={14} /> <span className="grow">Close window</span>
          </button>
        </PopMenu>
      )}
    </span>
  );
}

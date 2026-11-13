import { useMemo, useState } from 'react';
import { Check, ChevronDown, LayoutTemplate, Plus, RotateCcw, Save, SquarePlus, Trash2, Pencil, X } from 'lucide-react';
import { useWorkspaceStore } from '@/workspace/useWorkspaceStore';
import { templateById, templatesFor } from '@/workspace/templates';
import { signature } from '@/workspace/layoutModel';
import { REGISTRY, WINDOW_GROUPS } from '@/workspace/registry';
import { PopMenu } from '@/workspace/PopMenu';
import type { Scope } from '@/workspace/types';

/**
 * 32px strip of workspace tabs for the current app: each tab is an arrangement of windows. Tabs
 * rename on double-click, reorder by dragging and close with ×; + opens a new one from a template
 * or a saved layout. On the right: Add window, and the layout menu (Save, Save as, Rename, Delete,
 * Reset, or load a saved layout into this tab).
 */
export function TabStrip({ scope, pageTitle }: { scope: Scope | null; pageTitle?: string }) {
  if (!scope)
    return (
      <div className="tab-strip no-select" data-testid="tab-strip">
        <div className="ws-tabs" role="tablist" aria-label="Workspaces">
          <span className="ws-tab active static" role="tab" aria-selected>
            {pageTitle}
          </span>
        </div>
      </div>
    );
  return <DockTabs scope={scope} />;
}

function DockTabs({ scope }: { scope: Scope }) {
  const all = useWorkspaceStore((s) => s.workspaces);
  const tabs = useMemo(() => all.filter((w) => w.scope === scope), [all, scope]);
  const active = useWorkspaceStore((s) => s.active[scope]);
  const { setActive, closeWorkspace, renameWorkspace, moveWorkspace } = useWorkspaceStore.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [plus, setPlus] = useState<HTMLElement | null>(null);
  return (
    <div className="tab-strip no-select" data-testid="tab-strip">
      <div className="ws-tabs" role="tablist" aria-label="Workspaces">
        {tabs.map((w, i) => (
          <div
            key={w.id}
            className={`ws-tab ${w.id === active ? 'active' : ''} ${drag === w.id ? 'dragging' : ''}`}
            role="tab"
            aria-selected={w.id === active}
            tabIndex={0}
            draggable={editing !== w.id}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', w.id);
              setDrag(w.id);
            }}
            onDragOver={(e) => drag && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag && drag !== w.id) moveWorkspace(drag, i);
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
            onClick={() => setActive(scope, w.id)}
            onDoubleClick={() => setEditing(w.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActive(scope, w.id)}
            title={i < 9 ? `${w.name} (Ctrl+${i + 1}) · double-click to rename` : w.name}
            data-testid="ws-tab"
            data-name={w.name}
          >
            {editing === w.id ? (
              <input
                autoFocus
                className="ws-rename"
                defaultValue={w.name}
                aria-label="Workspace name"
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  renameWorkspace(w.id, e.currentTarget.value);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditing(null);
                  }
                }}
              />
            ) : (
              <span className="ws-name">{w.name}</span>
            )}
            <button
              className="ws-close"
              onClick={(e) => {
                e.stopPropagation();
                closeWorkspace(w.id);
              }}
              aria-label={`Close ${w.name}`}
              title="Close tab"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button className="ws-add" onClick={(e) => setPlus(plus ? null : e.currentTarget)} aria-label="New workspace tab" title="New tab from a template" data-testid="ws-new">
          <Plus size={13} />
        </button>
        {plus && (
          <PopMenu anchor={plus} onClose={() => setPlus(null)} width={250} testId="ws-new-menu">
            <OpenFrom scope={scope} onPick={(id) => (useWorkspaceStore.getState().openWorkspace(scope, id), setPlus(null))} />
          </PopMenu>
        )}
      </div>
      <span className="spacer" />
      <AddWindowMenu scope={scope} />
      <LayoutMenu scope={scope} />
    </div>
  );
}

/** Templates, then saved layouts, for a scope. */
function OpenFrom({ scope, onPick, current }: { scope: Scope; onPick: (id: string) => void; current?: string }) {
  const all = useWorkspaceStore((s) => s.layouts);
  const layouts = useMemo(() => all.filter((l) => l.scope === scope), [all, scope]);
  return (
    <>
      <div className="menu-group">Templates</div>
      {templatesFor(scope).map((t) => (
        <button key={t.id} className={`menu-item ${current === t.id ? 'hl' : ''}`} onClick={() => onPick(t.id)} data-testid={`open-${t.id}`}>
          <LayoutTemplate size={14} />
          <span className="grow">
            {t.name}
            <span className="menu-sub">{t.hint}</span>
          </span>
          {current === t.id && <Check size={12} />}
        </button>
      ))}
      {layouts.length > 0 && <div className="menu-group">Saved layouts</div>}
      {layouts.map((l) => (
        <button key={l.id} className={`menu-item ${current === l.id ? 'hl' : ''}`} onClick={() => onPick(l.id)} data-testid={`open-layout-${l.name}`}>
          <Save size={14} />
          <span className="grow">{l.name}</span>
          {current === l.id && <Check size={12} />}
        </button>
      ))}
    </>
  );
}

function AddWindowMenu({ scope }: { scope: Scope }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button className="ts-btn" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} aria-expanded={!!anchor} data-testid="add-window" title="Add a window to this workspace">
        <SquarePlus size={13} /> Window
      </button>
      {anchor && (
        <PopMenu anchor={anchor} onClose={() => setAnchor(null)} width={230} align="right" testId="add-window-menu">
          {WINDOW_GROUPS.map((g) => (
            <div key={g}>
              <div className="menu-group">{g}</div>
              {Object.values(REGISTRY)
                .filter((d) => d.group === g)
                .map((d) => {
                  const Icon = d.icon;
                  return (
                    <button
                      key={d.type}
                      className="menu-item"
                      onClick={() => {
                        setAnchor(null);
                        useWorkspaceStore.getState().addWindow(d.type, { scope });
                      }}
                      data-testid={`add-${d.type}`}
                    >
                      <Icon size={14} /> <span className="grow">{d.title}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </PopMenu>
      )}
    </>
  );
}

function LayoutMenu({ scope }: { scope: Scope }) {
  const ws = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.active[scope]));
  const layouts = useWorkspaceStore((s) => s.layouts);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [naming, setNaming] = useState<null | 'saveAs' | 'rename'>(null);
  const saved = layouts.find((l) => l.id === ws?.layoutId);
  const tpl = ws ? templateById(ws.layoutId) : undefined;
  const name = saved?.name ?? tpl?.name ?? 'Custom';
  const dirty = useMemo(() => {
    if (!ws) return false;
    const src = saved ?? (tpl ? tpl.build() : null);
    return !src || signature(ws.dock, ws.windows) !== signature(src.dock, src.windows);
  }, [ws, saved, tpl]);
  if (!ws) return null;
  const st = useWorkspaceStore.getState();
  const close = () => {
    setAnchor(null);
    setNaming(null);
  };
  return (
    <>
      <button className="ts-btn layout-btn" onClick={(e) => (anchor ? close() : setAnchor(e.currentTarget))} aria-expanded={!!anchor} data-testid="layout-menu" title="Layout: save, restore, reset">
        <span className="faint">Layout:</span> <span data-testid="layout-name">{name}</span>
        {dirty && (
          <span className="layout-dirty" title="Changed since saved" data-testid="layout-dirty">
            •
          </span>
        )}
        <ChevronDown size={12} />
      </button>
      {anchor && (
        <PopMenu anchor={anchor} onClose={close} width={260} align="right" testId="layout-menu-panel">
          {naming ? (
            <form
              className="layout-name-form"
              onSubmit={(e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget).get('name') as string;
                if (naming === 'saveAs') st.saveLayoutAs(v, ws.id);
                else st.renameLayout(v, ws.id);
                close();
              }}
            >
              <div className="menu-group">{naming === 'saveAs' ? 'Save layout as' : 'Rename layout'}</div>
              <input autoFocus name="name" className="input" defaultValue={naming === 'rename' ? name : `${ws.name} copy`} aria-label="Layout name" data-testid="layout-name-input" />
              <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" className="btn sm ghost" onClick={() => setNaming(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn sm primary" data-testid="layout-name-ok">
                  {naming === 'saveAs' ? 'Save' : 'Rename'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <button
                className="menu-item"
                onClick={() => {
                  if (saved) {
                    st.saveLayout(ws.id);
                    close();
                  } else setNaming('saveAs');
                }}
                data-testid="layout-save"
              >
                <Save size={14} /> <span className="grow">Save{saved ? '' : '…'}</span>
              </button>
              <button className="menu-item" onClick={() => setNaming('saveAs')} data-testid="layout-save-as">
                <SquarePlus size={14} /> <span className="grow">Save as…</span>
              </button>
              <button className="menu-item" onClick={() => setNaming('rename')} disabled={!saved} data-testid="layout-rename">
                <Pencil size={14} /> <span className="grow">Rename…</span>
              </button>
              <button
                className="menu-item danger"
                onClick={() => {
                  st.deleteLayout(ws.id);
                  close();
                }}
                disabled={!saved}
                data-testid="layout-delete"
              >
                <Trash2 size={14} /> <span className="grow">Delete</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  st.resetLayout(ws.id);
                  close();
                }}
                data-testid="layout-reset"
              >
                <RotateCcw size={14} /> <span className="grow">Reset to “{name}”</span>
              </button>
              <div className="divider" />
              <OpenFrom
                scope={scope}
                current={ws.layoutId}
                onPick={(id) => {
                  st.loadLayout(id, ws.id);
                  close();
                }}
              />
            </>
          )}
        </PopMenu>
      )}
    </>
  );
}

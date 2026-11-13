import { NavLink } from 'react-router-dom';
import { CircleUserRound, Palette, SquareCode } from 'lucide-react';
import { useOnchainStore } from '@/stores/useOnchainStore';
import { useUiStore } from '@/stores/useUiStore';
import { openStudio } from '../studioLauncher';
import { NAV } from './nav';

/**
 * 48px icon rail down the left: the apps (with their function keys in the tooltip), then
 * Appearance (the chart settings), Studio and Account at the foot. The active app carries the accent.
 */
export function AppRail() {
  const unseen = useOnchainStore((s) => s.unseen);
  return (
    <nav className="app-rail no-select" aria-label="Apps" data-testid="app-rail">
      {NAV.map((n) => {
        const Icon = n.icon;
        return (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `rail-item ${isActive ? 'active' : ''}`} aria-label={n.label} title={`${n.label} (${n.key})`} data-testid={`rail-${n.to.slice(1)}`}>
            <Icon size={18} strokeWidth={1.6} />
            {n.to === '/onchain' && unseen > 0 && (
              <span className="rail-count" title={`${unseen} new on-chain alert${unseen === 1 ? '' : 's'}`} data-testid="onchain-unseen">
                {unseen > 99 ? '99+' : unseen}
              </span>
            )}
          </NavLink>
        );
      })}
      <span className="rail-sep" />
      <button
        className="rail-item"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          useUiStore.getState().openChartMenu({ x: r.right + 8, y: r.top });
        }}
        aria-label="Appearance"
        title="Appearance: chart colours, theme and data feed (F8)"
        data-testid="rail-appearance"
      >
        <Palette size={18} strokeWidth={1.6} />
      </button>
      <span className="spacer" />
      <button className="rail-item" onClick={() => openStudio()} aria-label="Aztex Studio" title="Aztex Studio: indicator and strategy editor (F4)" data-testid="rail-studio">
        <SquareCode size={18} strokeWidth={1.6} />
      </button>
      <NavLink to="/account" className={({ isActive }) => `rail-item ${isActive ? 'active' : ''}`} aria-label="Account" title="Account (F7)" data-testid="rail-account">
        <CircleUserRound size={18} strokeWidth={1.6} />
      </NavLink>
    </nav>
  );
}

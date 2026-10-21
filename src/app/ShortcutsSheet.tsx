import { Modal } from '@/components/ui/Modal';
import { useUiStore } from '@/stores/useUiStore';
import { MOD_KEY } from './CommandPalette';
import './shortcuts.css';

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Navigate',
    keys: [
      ['F1 · F2 · F3 · F5 · F6', 'Terminal · Discovery · On-chain · Community · OTC'],
      ['F7', 'Account'],
      ['F4', 'Aztex Studio (own window)'],
      [MOD_KEY, 'Search symbols, pages and actions'],
      ['/', 'Command line'],
      ['Alt+N', 'News & calendar'],
      ['?', 'This sheet'],
    ],
  },
  {
    title: 'Chart',
    keys: [
      ['Alt+T · Alt+H · Alt+F', 'Trend line · horizontal line · Fib'],
      ['Esc', 'Cross tool / deselect / cancel'],
      ['Del', 'Remove the selected drawing'],
      ['Ctrl+Z', 'Undo drawing'],
      ['Alt+R', 'Reset chart view'],
      ['Wheel · drag', 'Zoom · pan'],
      ['Right-click', 'Quick actions at that price'],
      ['F8 · Ctrl+,', 'Chart settings (colours, theme, feed)'],
    ],
  },
  {
    title: 'Trade at the mouse',
    keys: [
      ['Alt+A', 'Add price alert'],
      ['Alt+Shift+B', 'Buy here (limit below the market, stop above)'],
      ['Alt+Shift+S', 'Sell here (limit above the market, stop below)'],
      ['Shift+T', 'Load the ticket with a limit here'],
    ],
  },
  {
    title: 'Tabs',
    keys: [
      ['Alt+Shift+T', 'New chart tab'],
      ['Alt+Shift+W', 'Close chart tab'],
      ['Middle-click', 'Close a tab'],
    ],
  },
];

export function ShortcutsSheet() {
  const open = useUiStore((s) => s.shortcuts);
  const set = useUiStore((s) => s.setShortcuts);
  return (
    <Modal open={open} onClose={() => set(false)} title="Keyboard shortcuts" subtitle="Everything one key away." width={760} testId="shortcuts">
      <div className="sc-grid">
        {GROUPS.map((g) => (
          <section key={g.title} className="sc-group">
            <h3>{g.title}</h3>
            {g.keys.map(([k, what]) => (
              <div key={k} className="sc-row">
                <span className="sc-keys">
                  {k.split(' · ').map((part, i) => (
                    <kbd key={i}>{part}</kbd>
                  ))}
                </span>
                <span className="sc-what">{what}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}

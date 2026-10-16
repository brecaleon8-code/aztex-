import { Download, AppWindow, FunctionSquare, FlaskConical, LineChart, RefreshCw, Keyboard } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { openStudio, STUDIO_URL } from '@/app/studioLauncher';
import { useStudioStore } from '@/stores/useStudioStore';
import './studio-download.css';

/**
 * Aztex Studio is a separate app (like MetaEditor next to MT5). This page is its "download":
 * open it in its own window or install it as a desktop app.
 */
export function StudioDownloadPage() {
  const indicators = useStudioStore((s) => s.indicators.length);
  const strategies = useStudioStore((s) => s.strategies.length);
  return (
    <div className="sd">
      <div className="page-head">
        <div>
          <h1>Aztex Studio</h1>
          <p>The indicator &amp; strategy editor is its own app: it runs in a separate window next to the terminal and installs like a desktop program.</p>
        </div>
      </div>
      <div className="sd-grid">
        <Panel title="Get Studio" testId="studio-download">
          <div className="sd-hero">
            <img src="/brand/studio-192.png" alt="" width={84} height={84} className="sd-icon" />
            <div className="sd-hero-text">
              <div className="sd-name">Aztex Studio</div>
              <div className="label">Desktop app · Windows, macOS, Linux, ChromeOS (via Chrome / Edge)</div>
              <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button className="btn primary lg" onClick={() => openStudio(`${STUDIO_URL}?install=1`)} data-testid="studio-get">
                  <Download size={14} /> Install Studio
                </button>
                <button className="btn lg" onClick={() => openStudio()} data-testid="studio-open">
                  <AppWindow size={14} /> Open in a window
                </button>
              </div>
              <p className="sd-note">
                Install opens Studio and offers your browser&apos;s install prompt. Once installed it has its own icon, window and taskbar entry. Press <kbd>F4</kbd> in the terminal to open it any time.
              </p>
            </div>
          </div>
        </Panel>
        <Panel title="Your library" sub="shared with the terminal">
          <div className="sd-stats">
            <div>
              <span className="num sd-big">{indicators}</span>
              <span className="label">indicators</span>
            </div>
            <div>
              <span className="num sd-big">{strategies}</span>
              <span className="label">strategies</span>
            </div>
          </div>
          <p className="sd-note">Everything you save in Studio shows up in the terminal&apos;s Indicator menu straight away — no export or reload.</p>
        </Panel>
        <Panel title="What's inside" className="sd-features">
          <ul className="sd-list">
            <li>
              <FunctionSquare size={15} />
              <span><b>Formula &amp; JavaScript indicators</b> — sandboxed scripts with inputs, live preview and errors by line.</span>
            </li>
            <li>
              <FlaskConical size={15} />
              <span><b>Strategy backtests</b> — entry/exit rules, TP/SL, fees from your tier, trade list and equity curve.</span>
            </li>
            <li>
              <LineChart size={15} />
              <span><b>Plot on the chart</b> — push indicators and strategy signals to the terminal&apos;s chart in one click.</span>
            </li>
            <li>
              <RefreshCw size={15} />
              <span><b>Always in sync</b> — terminal and Studio share one library; edit in either place.</span>
            </li>
            <li>
              <Keyboard size={15} />
              <span><b>F4</b> opens Studio from the terminal, like MetaEditor in MT5.</span>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

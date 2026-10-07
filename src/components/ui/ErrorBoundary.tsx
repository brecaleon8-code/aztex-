import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Clears every persisted Aztex preference (layouts, studio, news, …) — a recovery hatch for bad saved state. */
export function resetSavedSettings() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('aztex.')) localStorage.removeItem(k);
  } catch {
    /* storage blocked — nothing to clear */
  }
  location.reload();
}

interface Props {
  children: ReactNode;
  /** 'page' replaces the whole app; 'inline' renders a compact notice in place of the failed part. */
  variant?: 'page' | 'inline';
  label?: string;
  onClose?: () => void;
}

/**
 * Turns a render-time crash into a readable message instead of a blank screen, with the error text
 * (so it can be reported) and one-click recovery.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[aztex] ${this.props.label ?? 'App'} crashed:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const detail = `${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(1, 6).join('\n')}`;
    if (this.props.variant === 'inline') {
      return (
        <div className="err-inline" role="alert" data-testid="error-inline">
          <b>{this.props.label ?? 'This section'} stopped working</b>
          <code>{error.message}</code>
          <div className="row">
            <button className="btn sm" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            {this.props.onClose && (
              <button className="btn sm ghost" onClick={this.props.onClose}>
                Close
              </button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="err-page" role="alert" data-testid="error-page">
        <h1>Something went wrong</h1>
        <p>The app hit an error and stopped. The message below says what failed — copy it if you report the problem.</p>
        <pre>{detail}</pre>
        <div className="row">
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={resetSavedSettings} data-testid="reset-settings">
            Reset saved settings &amp; reload
          </button>
          <button className="btn ghost" onClick={() => void navigator.clipboard?.writeText(detail)}>
            Copy error
          </button>
        </div>
      </div>
    );
  }
}

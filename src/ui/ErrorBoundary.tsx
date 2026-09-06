import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last line of defence: a render error shows a message instead of an empty black window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('SatLoc crashed while rendering', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="error-panel" role="alert" data-testid="app-crash">
        <div>
          <strong>SatLoc ran into a problem and stopped.</strong>
          <div>Reloading usually fixes it. If it keeps happening, please report the message below.</div>
          <code>{error.message}</code>
          <p>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </p>
        </div>
      </div>
    );
  }
}

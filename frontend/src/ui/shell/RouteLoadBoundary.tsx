import { Component, type ErrorInfo, type ReactNode } from 'react';
import { loadingError } from '../../diagnostics/loadingTimeline';

interface Props {
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetKey: string;
}

export class RouteLoadBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    loadingError('route', 'render-or-chunk-failed', error);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="route-load-error" role="alert">
        <strong>This screen could not be loaded.</strong>
        <button type="button" onClick={() => window.location.reload()}>Retry</button>
      </main>
    );
  }
}


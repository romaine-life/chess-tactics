import { Component, type ErrorInfo, type ReactNode } from 'react';
import { loadingError } from '../../diagnostics/loadingTimeline';
import { ChromeButton } from '../shared/ChromeButton';

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
      // A registered inner-text-button, like every other runtime control (ADR-0102). The route
      // failed to load, not the chrome family, so this reaches the same installed frame the rest
      // of the app's buttons wear.
      <main className="route-load-error chrome-family-surface" role="alert">
        <strong>This screen could not be loaded.</strong>
        <ChromeButton unit="inner-text-button" className="le-seg-btn" onClick={() => window.location.reload()}>Retry</ChromeButton>
      </main>
    );
  }
}


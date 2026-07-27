import { Component, type ErrorInfo, type ReactNode } from 'react';
import { DemoEnvironmentError } from '../config/demoEnvironment';
import './DemoErrorBoundary.css';

interface DemoErrorBoundaryProps {
  readonly children: ReactNode;
}

interface DemoErrorBoundaryState {
  readonly error: Error | null;
}

export class DemoErrorBoundary extends Component<DemoErrorBoundaryProps, DemoErrorBoundaryState> {
  constructor(props: DemoErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): DemoErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Mission Planner demo render failed', {
      errorName: error.name,
      errorMessage: error.message,
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }

    return (
      <main className="demo-error-boundary" role="alert">
        <section className="demo-error-boundary__panel">
          <p className="demo-error-boundary__eyebrow">Demo unavailable</p>
          <h1>{error.name}</h1>
          <p className="demo-error-boundary__message">{error.message}</p>
          {error instanceof DemoEnvironmentError && (
            <p className="demo-error-boundary__instruction">
              Copy <code>.env.example</code> to <code>.env.local</code>, add the required
              domain-restricted client tokens, and restart the demo.
            </p>
          )}
          <button type="button" onClick={() => window.location.reload()}>
            Restart demo
          </button>
        </section>
      </main>
    );
  }
}

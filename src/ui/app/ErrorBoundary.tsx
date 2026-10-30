import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, Panel } from '../design-system/primitives';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Outreach UI failed', error, info.componentStack);
  }
  override render() {
    if (this.state.failed)
      return (
        <main className="app-viewport">
          <Panel role="alert">
            <h1>Outreach Desk needs a reload</h1>
            <p>Your saved records remain available. Reload the window to reconnect.</p>
            <Button onClick={() => location.reload()}>Reload window</Button>
          </Panel>
        </main>
      );
    return this.props.children;
  }
}

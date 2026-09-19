import { Component } from 'react';
import { reportError } from '../lib/errorReporting.js';

// Catches a render-time crash anywhere in its subtree so one broken
// component blanks a fallback screen instead of the whole app going white.
// Must be a class component — React only supports error boundaries via
// getDerivedStateFromError/componentDidCatch, no hook equivalent exists.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportError(error);
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>Punchlist hit an unexpected error. Reloading usually fixes it.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

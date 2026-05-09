import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Industrialist Calculator Crash caught:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('industrialist-flow-state');
    } catch {
      console.warn('Failed to clear localStorage');
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className={styles['error-boundary-container']}>
          <div className={styles['error-boundary-modal']}>
            <h2 className={styles['error-boundary-title']}>Industrialist Calculator Crashed</h2>
            <p className={styles['error-boundary-text']}>
              An unhandled runtime error occurred. This is usually caused by corrupted flowchart
              data.
            </p>
            {this.state.error && (
              <pre className={styles['error-boundary-details']}>
                {this.state.error.stack || this.state.error.message}
              </pre>
            )}
            <button className={styles['error-boundary-btn']} onClick={this.handleReset}>
              Clear Cache & Reset Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

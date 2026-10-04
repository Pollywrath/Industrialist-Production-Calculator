import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';
import { clearAllData } from '../../persistence/idb';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
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

  private handleReset = async () => {
    try {
      await clearAllData();
    } catch (err) {
      console.warn('Failed to clear application cache:', err);
    }
    window.location.reload();
  };

  private getErrorMessage(error: Error | null): { subtitle: string; description: string } {
    if (!error) {
      return {
        subtitle: 'The app stopped unexpectedly',
        description:
          'Try reloading the page first. If the problem continues, you can clear the browser autosave, custom data, and cached wiki results below. Named Save Manager saves are kept.',
      };
    }

    const message = (error.message || '').toLowerCase();
    const stack = (error.stack || '').toLowerCase();

    if (
      message.includes('database') ||
      message.includes('fetch') ||
      message.includes('import') ||
      message.includes('json') ||
      message.includes('disconnection') ||
      stack.includes('lookup.ts') ||
      stack.includes('initializedatabase')
    ) {
      return {
        subtitle: 'Could not open local app data',
        description:
          'The app could not read its local data store. Reload the page and try again. If it keeps failing, clearing local app data below may help.',
      };
    }

    if (
      message.includes('reactflow') ||
      message.includes('node') ||
      message.includes('edge') ||
      stack.includes('flowcanvas') ||
      stack.includes('flowviewport') ||
      stack.includes('recipenode')
    ) {
      return {
        subtitle: 'The canvas could not be shown',
        description:
          'The app hit an error while drawing the current graph. Reload the page. If the same layout causes the error again, open a bug report and include the details shown below.',
      };
    }

    return {
      subtitle: 'The app stopped unexpectedly',
      description:
        'Try reloading the page first. If the problem continues, you can clear the browser autosave, custom data, and cached wiki results below. Named Save Manager saves are kept.',
    };
  }

  public render() {
    if (this.state.hasError) {
      const { subtitle, description } = this.getErrorMessage(this.state.error);

      return (
        <div className={styles['error-boundary-container']}>
          <div className={styles['error-boundary-modal']}>
            <h2 className={styles['error-boundary-title']}>Industrialist Calculator stopped</h2>
            <div className={styles['error-boundary-subtitle']}>[ {subtitle} ]</div>
            <p className={styles['error-boundary-text']}>{description}</p>
            {this.state.error && (
              <pre className={styles['error-boundary-details']}>
                {this.state.error.stack || this.state.error.message}
              </pre>
            )}
            <button className={styles['error-boundary-btn']} onClick={this.handleReset}>
              Clear local app data and restart
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

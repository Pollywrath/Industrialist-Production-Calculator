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
        subtitle: 'Unhandled Runtime Exception',
        description:
          'An unexpected application error occurred. You can reset your local state to restore default operations.',
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
        subtitle: 'Database Initialization Failure',
        description:
          'The application was unable to fetch the static recipes database. This is usually caused by an offline internet connection, a temporary CDN block, or a local network firewall restriction.',
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
        subtitle: 'Flowchart Rendering Crash',
        description:
          'An unhandled exception occurred rendering your active flowchart canvas. This is typically caused by corrupted local flowchart data or incompatible save-game versions.',
      };
    }

    return {
      subtitle: 'Unhandled Runtime Exception',
      description:
        'An unexpected runtime error occurred. This can usually be resolved by clearing your local storage cache and reloading.',
    };
  }

  public render() {
    if (this.state.hasError) {
      const { subtitle, description } = this.getErrorMessage(this.state.error);

      return (
        <div className={styles['error-boundary-container']}>
          <div className={styles['error-boundary-modal']}>
            <h2 className={styles['error-boundary-title']}>Industrialist Calculator Crashed</h2>
            <div className={styles['error-boundary-subtitle']}>[ {subtitle} ]</div>
            <p className={styles['error-boundary-text']}>{description}</p>
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

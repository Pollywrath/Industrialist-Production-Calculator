import { useCallback, useEffect, useRef, useState } from 'react';
import { getAutosaveTabId } from '../persistence/autosaveIdentity';
import { AutosaveUpdateCoordinator } from './AutosaveUpdateCoordinator';
import styles from './PwaManager.module.css';

type UpdateState = 'idle' | 'saving' | 'error';

export function PwaManager() {
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [updateError, setUpdateError] = useState('');
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const applyingUpdate = useRef(false);
  const coordinator = useRef<AutosaveUpdateCoordinator | null>(null);

  const applyUpdate = useCallback(async (worker?: ServiceWorker | null) => {
    if (!worker || applyingUpdate.current) return;
    applyingUpdate.current = true;
    setUpdateState('saving');
    setUpdateError('');
    try {
      if (!coordinator.current) {
        throw new Error('Could not coordinate saves across open tabs. Reload the page and retry.');
      }
      await coordinator.current.prepareAllTabs();
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      setUpdateError(
        error instanceof Error
          ? error.message
          : 'Could not save the current graph before updating.',
      );
      setUpdateState('error');
    } finally {
      applyingUpdate.current = false;
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

    let disposed = false;
    let hadController = Boolean(navigator.serviceWorker.controller);
    let hasReloaded = false;
    let currentRegistration: ServiceWorkerRegistration | null = null;
    let updateInterval: number | undefined;
    try {
      coordinator.current = new AutosaveUpdateCoordinator(getAutosaveTabId());
    } catch (error) {
      console.warn('Could not initialize cross-tab update coordination:', error);
    }
    const checkForUpdate = () => {
      if (navigator.onLine && currentRegistration) {
        void currentRegistration.update().catch(() => undefined);
      }
    };
    window.addEventListener('online', checkForUpdate);

    const checkWaitingWorker = () => {
      if (currentRegistration?.waiting && hadController) {
        void applyUpdate(currentRegistration.waiting);
      }
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then((registered) => {
        if (disposed) return;
        currentRegistration = registered;
        setRegistration(registered);
        checkWaitingWorker();

        registered.addEventListener('updatefound', () => {
          const installing = registered.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              checkWaitingWorker();
            }
          });
        });

        updateInterval = window.setInterval(checkForUpdate, 60 * 60 * 1000);
      })
      .catch((error: unknown) => {
        console.error('Failed to register the offline app service worker:', error);
      });

    const handleControllerChange = () => {
      if (hadController && !hasReloaded) {
        hasReloaded = true;
        window.location.reload();
      }
      hadController = true;
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      disposed = true;
      coordinator.current?.dispose();
      coordinator.current = null;
      window.removeEventListener('online', checkForUpdate);
      if (updateInterval !== undefined) window.clearInterval(updateInterval);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [applyUpdate]);

  if (!import.meta.env.PROD) return null;

  if (updateState === 'idle') return null;

  return (
    <aside className={styles.status} aria-live="polite">
      {updateState === 'saving' && <span>Saving your graph before applying an update…</span>}
      {updateState === 'error' && (
        <>
          <span>Update waiting. {updateError}</span>
          <button
            type="button"
            onClick={() => void applyUpdate(registration?.waiting)}
            disabled={!registration?.waiting}
          >
            Retry update
          </button>
        </>
      )}
    </aside>
  );
}

import { useEffect } from 'react';
import { useFlowStore } from '../stores/useFlowStore';
import { useUIStore } from '../stores/useUIStore';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { getAutosave } from './idb';
import { deserializeCanvas } from './transformer';
import { getAutosaveTabId } from './autosaveIdentity';
import { saveCurrentAutosave } from './autosaveWriter';

let startupAutosavePromise: ReturnType<typeof getAutosave> | null = null;

function getStartupAutosave(): ReturnType<typeof getAutosave> {
  startupAutosavePromise ??= getAutosave(getAutosaveTabId());
  return startupAutosavePromise;
}

export function useAutosave(): void {
  useEffect(() => {
    let isMounted = true;
    getStartupAutosave()
      .then(async (record) => {
        if (!isMounted) return;
        if (record && record.data) {
          const currentStore = useFlowStore.getState();
          if (currentStore.nodes.length === 0 && currentStore.edges.length === 0) {
            const { nodes, edges } = deserializeCanvas(record.data);

            if (nodes.length >= 250) {
              const confirmed = await useUIStore.getState().confirm({
                title: 'PERFORMANCE WARNING',
                message: `This autosave contains ${nodes.length} nodes. Loading this graph will degrade graph performance and take a while to load. Continue?`,
                confirmLabel: 'LOAD AUTOSAVE',
                cancelLabel: 'START FRESH',
                intent: 'info',
              });

              if (!confirmed) {
                return;
              }
            }

            currentStore.setNodesAndEdges(nodes, edges, {
              recordHistory: false,
              resetHistory: true,
            });
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to load autosave on startup:', err);
      })
      .finally(() => {
        if (isMounted) {
          useUIStore.getState().setAutosaveLoaded();
        }
      });

    let dirtyVersion = 0;
    let lastSavedVersion = 0;
    let isSaving = false;

    const unsub = useFlowStore.subscribe(
      (state) => ({ nodes: state.nodes, edges: state.edges }),
      () => {
        dirtyVersion++;
      },
      {
        equalityFn: (prev, next) => prev.nodes === next.nodes && prev.edges === next.edges,
      },
    );

    const unsubGlobalSettings = useGlobalSettingsStore.subscribe(() => {
      dirtyVersion++;
    });

    const saveIfDirty = () => {
      if (dirtyVersion === lastSavedVersion) return;
      if (isSaving) return;

      isSaving = true;
      const capturedVersion = dirtyVersion;
      saveCurrentAutosave(getAutosaveTabId())
        .then(() => {
          if (dirtyVersion === capturedVersion) {
            lastSavedVersion = capturedVersion;
          }
        })
        .catch((err) => {
          console.warn('Failed to commit autosave interval:', err);
        })
        .finally(() => {
          isSaving = false;
        });
    };

    const intervalId = setInterval(() => {
      if (!document.hidden) saveIfDirty();
    }, 5000);

    const handleBeforeUnload = () => {
      void saveCurrentAutosave(getAutosaveTabId()).catch((err) => {
        console.warn('Failed to commit autosave beforeunload:', err);
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) saveIfDirty();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      unsub();
      unsubGlobalSettings();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}

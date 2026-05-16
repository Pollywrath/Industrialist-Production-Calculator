import { useEffect } from 'react';
import { useFlowStore } from '../stores/useFlowStore';
import { useUIStore } from '../stores/useUIStore';
import { getAutosave, saveAutosave } from './idb';
import { serializeCanvas, deserializeCanvas } from './transformer';

export function useAutosave(): void {
  useEffect(() => {
    let isMounted = true;

    getAutosave()
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

            currentStore.setNodesAndEdges(nodes, edges);
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

    const intervalId = setInterval(() => {
      if (document.hidden) return;
      const { nodes, edges } = useFlowStore.getState();
      const data = serializeCanvas(nodes, edges);
      saveAutosave(data).catch((err) => {
        console.warn('Failed to commit autosave interval:', err);
      });
    }, 5000);

    const handleBeforeUnload = () => {
      const { nodes, edges } = useFlowStore.getState();
      const data = serializeCanvas(nodes, edges);
      saveAutosave(data).catch((err) => {
        console.warn('Failed to commit autosave beforeunload:', err);
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}

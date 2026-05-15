import React, { useState, useEffect } from 'react';
import { createStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { getSaves, saveSave, deleteSave, renameSave } from '../../../persistence/idb';
import type { SaveRecord } from '../../../types/saves';
import { serializeCanvas, deserializeCanvas } from '../../../persistence/transformer';
import { nextSaveId } from '../../../utils/idGenerator';
import { mergeSaveIntoCanvas } from '../../../utils/graphMerge';
import { exportCanvasAsPng, exportRecordAsJson } from '../../../utils/canvasExport';
import { SavesOverlayContext, type SavesOverlayState, type SaveStatus } from './SavesOverlayContext';

interface SavesOverlayProviderProps {
  children: React.ReactNode;
}

export function SavesOverlayProvider({ children }: SavesOverlayProviderProps) {
  const [store] = useState(() =>
    createStore(
      subscribeWithSelector<SavesOverlayState>((set, get) => {
        let statusTimer: ReturnType<typeof setTimeout>;

        const setStatusWithTimeout = (status: SaveStatus) => {
          clearTimeout(statusTimer);
          set({ status });
          if (status.type === 'success') {
            statusTimer = setTimeout(() => {
              if (get().status.type === 'success') {
                set({ status: { type: 'idle', message: '' } });
              }
            }, 3000);
          }
        };

        return {
          saves: [],
          newSaveName: '',
          editingId: null,
          editName: '',
          status: { type: 'idle', message: '' },

          setNewSaveName: (newSaveName) => set({ newSaveName }),
          setEditName: (editName) => set({ editName }),
          setStatus: setStatusWithTimeout,
          clearStatus: () => {
            clearTimeout(statusTimer);
            set({ status: { type: 'idle', message: '' } });
          },

          refreshSaves: async () => {
            try {
              const records = await getSaves();
              set({ saves: records.sort((a, b) => b.timestamp - a.timestamp) });
            } catch {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to refresh saves. Storage quota exceeded or unavailable.',
              });
            }
          },

          handleCreateSave: async () => {
            const state = get();
            if (!state.newSaveName.trim()) return;

            setStatusWithTimeout({ type: 'pending', message: 'Writing save file...' });
            const { nodes, edges } = useFlowStore.getState();
            const data = serializeCanvas(nodes, edges);

            const record: SaveRecord = {
              id: nextSaveId(),
              name: state.newSaveName.trim(),
              timestamp: Date.now(),
              data,
            };

            const success = await saveSave(record);
            if (success) {
              set({ newSaveName: '' });
              setStatusWithTimeout({ type: 'success', message: 'Save created successfully!' });
              await get().refreshSaves();
            } else {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to write save. Please check storage quota.',
              });
            }
          },

          handleOverwriteLoad: async (record) => {
            try {
              setStatusWithTimeout({ type: 'pending', message: 'Loading save...' });
              const { nodes, edges } = deserializeCanvas(record.data);
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              useFlowStore.getState().setNodesAndEdges(nodes, edges);
              useUIStore.getState().setSavesOverlayOpen(false);
            } catch {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to load save data. File may be corrupted.',
              });
            }
          },

          handleMergeLoad: async (record) => {
            try {
              setStatusWithTimeout({ type: 'pending', message: 'Merging save...' });
              const { nodes: loadedNodes, edges: loadedEdges } = deserializeCanvas(record.data);
              const { nodes: currentNodes, edges: currentEdges, setNodesAndEdges } = useFlowStore.getState();

              const { nodes, edges } = mergeSaveIntoCanvas(
                loadedNodes,
                loadedEdges,
                currentNodes,
                currentEdges,
              );

              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              setNodesAndEdges(nodes, edges);
              useUIStore.getState().setSavesOverlayOpen(false);
            } catch {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to merge save data. File may be corrupted.',
              });
            }
          },

          handleOverwriteSave: async (record) => {
            const confirmed = await useUIStore.getState().confirm({
              title: 'OVERWRITE SAVE',
              message: `Overwrite save "${record.name}" with current active canvas?`,
              confirmLabel: 'OVERWRITE',
              intent: 'info',
            });
            if (!confirmed) return;

            setStatusWithTimeout({ type: 'pending', message: 'Overwriting save file...' });
            const { nodes, edges } = useFlowStore.getState();
            const data = serializeCanvas(nodes, edges);

            const updatedRecord: SaveRecord = {
              ...record,
              timestamp: Date.now(),
              data,
            };

            const success = await saveSave(updatedRecord);
            if (success) {
              setStatusWithTimeout({ type: 'success', message: 'Save overwritten successfully!' });
              await get().refreshSaves();
            } else {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to overwrite save. Storage quota exceeded.',
              });
            }
          },

          handleDeleteSave: async (id) => {
            const record = get().saves.find(s => s.id === id);
            const name = record?.name || 'this save';

            const confirmed = await useUIStore.getState().confirm({
              title: 'DELETE SAVE',
              message: `Permanently delete "${name}"? This action cannot be undone.`,
              confirmLabel: 'DELETE',
              intent: 'error',
            });
            if (!confirmed) return;

            setStatusWithTimeout({ type: 'pending', message: 'Deleting save...' });
            const success = await deleteSave(id);
            if (success) {
              setStatusWithTimeout({ type: 'success', message: 'Save deleted successfully!' });
              await get().refreshSaves();
            } else {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to delete save. File unavailable.',
              });
            }
          },

          startRename: (record) => {
            set({ editingId: record.id, editName: record.name });
          },

          commitRename: async (id) => {
            const state = get();
            const newName = state.editName.trim();
            if (newName) {
              setStatusWithTimeout({ type: 'pending', message: 'Renaming save...' });
              const success = await renameSave(id, newName);
              if (success) {
<<<<<<< HEAD
                
=======
                // Optimistic update to prevent stale data flashing
>>>>>>> 6f57471 (saves manager, need to do some cleaning)
                set((s) => ({
                  editingId: null,
                  saves: s.saves.map((save) =>
                    save.id === id ? { ...save, name: newName } : save
                  ),
                }));
                setStatusWithTimeout({ type: 'success', message: 'Save renamed successfully!' });
                await get().refreshSaves();
              } else {
                setStatusWithTimeout({
                  type: 'error',
                  message: 'Failed to rename save. Storage access denied.',
                });
              }
            } else {
              set({ editingId: null });
            }
          },

          cancelRename: () => {
            set({ editingId: null, editName: '' });
          },

          handleImportJson: async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            setStatusWithTimeout({ type: 'pending', message: 'Importing JSON save file...' });

            const reader = new FileReader();
            reader.onload = async (event) => {
              try {
                const parsed = JSON.parse(event.target?.result as string);
                if (parsed && parsed.data) {
                  const record: SaveRecord = {
                    id: nextSaveId(),
                    name: typeof parsed.name === 'string' ? `${parsed.name} (Imported)` : 'Imported Save',
                    timestamp: Date.now(),
                    data: parsed.data,
                  };
                  const success = await saveSave(record);
                  if (success) {
                    setStatusWithTimeout({ type: 'success', message: 'Save imported successfully!' });
                    await get().refreshSaves();
                  } else {
                    setStatusWithTimeout({
                      type: 'error',
                      message: 'Failed to store imported save. Storage quota exceeded.',
                    });
                  }
                } else {
                  setStatusWithTimeout({
                    type: 'error',
                    message: 'Invalid save file format. Missing data payload.',
                  });
                }
              } catch {
                setStatusWithTimeout({
                  type: 'error',
                  message: 'Malformed JSON file. Import failed.',
                });
              }
              e.target.value = '';
            };
            reader.onerror = () => {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to read file from filesystem.',
              });
              e.target.value = '';
            };
            reader.readAsText(file);
          },

          handleExportJson: (record) => {
            try {
              exportRecordAsJson(record);
              setStatusWithTimeout({ type: 'success', message: 'JSON exported successfully!' });
            } catch {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to export JSON save file.',
              });
            }
          },

          handleExportPng: async () => {
            const { nodes } = useFlowStore.getState();
            if (nodes.length === 0) {
              setStatusWithTimeout({
                type: 'error',
                message: 'Canvas is empty. Nothing to export.',
              });
              return;
            }

            setStatusWithTimeout({ type: 'pending', message: 'Rendering PNG snapshot...' });
            try {
              await exportCanvasAsPng(nodes);
              setStatusWithTimeout({ type: 'success', message: 'PNG exported successfully!' });
            } catch (err) {
              console.error('PNG Export Error:', err);
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to generate PNG snapshot. Canvas may be tainted.',
              });
            }
          },
        };
      }),
    ),
  );

  useEffect(() => {
    const s = store.getState();
    s.refreshSaves();
    return () => {
      s.clearStatus();
      s.cancelRename();
    };
  }, [store]);

  return <SavesOverlayContext.Provider value={store}>{children}</SavesOverlayContext.Provider>;
}


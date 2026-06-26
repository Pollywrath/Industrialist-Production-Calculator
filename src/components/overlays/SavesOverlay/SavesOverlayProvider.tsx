import React, { useState, useEffect } from 'react';
import { createStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useDataStore } from '../../../stores/useDataStore';
import {
  getSaves,
  saveSave,
  deleteSave,
  renameSave,
  batchSaveDataOverrides,
  getDataOverrides,
} from '../../../persistence/idb';
import type { SaveRecord } from '../../../types/saves';
import { serializeCanvas, deserializeCanvas } from '../../../persistence/transformer';
import { mergeSaveIntoCanvas } from '../../../persistence/graphMerge';
import { nextSaveId } from '../../../utils/idGenerator';
import { exportCanvasAsPng, exportRecordAsJson } from '../../../services/canvasExportService';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';
import {
  validateProduct,
  validateMachine,
  validateRecipe,
  validateResearch,
} from '../../../utils/dataValidation';
import {
  getDefaultProducts,
  getDefaultMachines,
  getDefaultResearches,
  reloadDatabase,
} from '../../../data/lookup';
import {
  SavesOverlayContext,
  type SavesOverlayState,
  type SaveStatus,
} from './SavesOverlayContext';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SavesOverlayProviderProps {
  children: React.ReactNode;
}

function validateSaveOverrides(
  overrides: { id: string; data: Record<string, unknown> }[]
): { valid: boolean; errorMessages: string[] } {
  const errorMessages: string[] = [];

  const productIds = new Set<string>(getDefaultProducts().map((p) => p.id));
  const machineIds = new Set<string>(getDefaultMachines().map((m) => m.id));
  const researchIds = new Set<string>(getDefaultResearches().map((r) => r.id));

  for (let i = 0; i < overrides.length; i++) {
    const entry = overrides[i];
    const prefixIdx = entry.id.indexOf(':');
    if (prefixIdx === -1) continue;
    const prefix = entry.id.substring(0, prefixIdx + 1);
    const cleanId = entry.id.substring(prefixIdx + 1);

    if (entry.data._tombstone || entry.data.category === 'Removed') {
      if (prefix === 'product:') productIds.delete(cleanId);
      if (prefix === 'machine:') machineIds.delete(cleanId);
      if (prefix === 'research:') researchIds.delete(cleanId);
    } else {
      if (prefix === 'product:') productIds.add(cleanId);
      if (prefix === 'machine:') machineIds.add(cleanId);
      if (prefix === 'research:') researchIds.add(cleanId);
    }
  }

  for (let i = 0; i < overrides.length; i++) {
    const entry = overrides[i];
    if (entry.data._tombstone) {
      continue;
    }

    const prefixIdx = entry.id.indexOf(':');
    if (prefixIdx === -1) continue;
    const prefix = entry.id.substring(0, prefixIdx + 1);
    const cleanId = entry.id.substring(prefixIdx + 1);

    const dataWithId = { ...entry.data, id: cleanId };

    if (prefix === 'product:') {
      const res = validateProduct(dataWithId);
      if (!res.valid) {
        res.errors.forEach((err) => {
          errorMessages.push(`[Product ${cleanId}] ${err.field}: ${err.message}`);
        });
      }
    } else if (prefix === 'machine:') {
      const res = validateMachine(dataWithId, researchIds, machineIds);
      if (!res.valid) {
        res.errors.forEach((err) => {
          errorMessages.push(`[Machine ${cleanId}] ${err.field}: ${err.message}`);
        });
      }
    } else if (prefix === 'recipe:') {
      const res = validateRecipe(dataWithId, productIds, machineIds);
      if (!res.valid) {
        res.errors.forEach((err) => {
          errorMessages.push(`[Recipe ${cleanId}] ${err.field}: ${err.message}`);
        });
      }
    } else if (prefix === 'research:') {
      const res = validateResearch(dataWithId);
      if (!res.valid) {
        res.errors.forEach((err) => {
          errorMessages.push(`[Research ${cleanId}] ${err.field}: ${err.message}`);
        });
      }
    }
  }

  return {
    valid: errorMessages.length === 0,
    errorMessages,
  };
}

async function processSaveCustomData(record: SaveRecord): Promise<boolean> {
  const overrides = record.data.dataOverrides;
  if (!overrides || overrides.length === 0) {
    return true;
  }

  const loadCustomData = await useUIStore.getState().confirm({
    title: 'CUSTOM DATABASE OVERRIDES',
    message: `This save contains custom database overrides. Would you like to load both the canvas and the custom database overrides, or load the canvas only?`,
    confirmLabel: 'LOAD DATA & CANVAS',
    cancelLabel: 'LOAD CANVAS ONLY',
    intent: 'info',
    threeWay: true,
  });

  if (loadCustomData === 'close') {
    return false;
  }

  if (loadCustomData === 'confirm') {
    const validation = validateSaveOverrides(overrides);
    if (validation.valid) {
      const saveSuccess = await batchSaveDataOverrides(overrides);
      if (saveSuccess) {
        await reloadDatabase();
        useDataStore.setState((state) => ({ dbVersion: state.dbVersion + 1 }));
      } else {
        console.warn('Failed to batch save data overrides to IndexedDB.');
      }
    } else {
      const errorDetails = validation.errorMessages.slice(0, 10).join('\n');
      const suffix =
        validation.errorMessages.length > 10
          ? `\n...and ${validation.errorMessages.length - 10} more errors.`
          : '';
      await useUIStore.getState().confirm({
        title: 'INVALID CUSTOM DATA',
        message: `The custom database overrides in this save file are invalid and could not be loaded. Falling back to loading the canvas only.\n\nErrors:\n${errorDetails}${suffix}`,
        confirmLabel: 'LOAD CANVAS ONLY',
        showCancel: false,
        intent: 'error',
      });
    }
  }

  return true;
}

export function SavesOverlayProvider({ children }: SavesOverlayProviderProps) {
  const [store] = useState(() =>
    createStore(
      subscribeWithSelector<SavesOverlayState>((set, get) => {
        let statusTimer: ReturnType<typeof setTimeout>;

        const setStatusWithTimeout = (
          status: SaveStatus,
          pendingId: string | null = null,
          pendingAction: SavesOverlayState['pendingAction'] = null,
        ) => {
          clearTimeout(statusTimer);
          set({
            status,
            pendingId: status.type === 'pending' ? pendingId : null,
            pendingAction: status.type === 'pending' ? pendingAction : null,
          });
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
          pendingId: null,
          pendingAction: null,

          setNewSaveName: (newSaveName) => set({ newSaveName }),
          setEditName: (editName) => set({ editName }),
          setStatus: setStatusWithTimeout,
          clearStatus: () => {
            clearTimeout(statusTimer);
            set({ status: { type: 'idle', message: '' }, pendingId: null, pendingAction: null });
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

          handleCreateSave: async (source) => {
            const state = get();
            if (!state.newSaveName.trim()) return;
            if (isTutorialActive() && !canPerformTutorialAction({ type: 'save-create', source })) {
              return;
            }

            setStatusWithTimeout(
              { type: 'pending', message: 'Writing save file...' },
              null,
              'create',
            );
            await delay(200);
            const { nodes, edges } = useFlowStore.getState();
            const overrides = await getDataOverrides();
            const data = serializeCanvas(nodes, edges, overrides);

            const record: SaveRecord = {
              id: nextSaveId(),
              name: state.newSaveName.trim(),
              timestamp: Date.now(),
              data,
            };

            const success = await saveSave(record);
            if (success) {
              useTutorialStore.getState().registerSaveCreated(record.id);
              set({ newSaveName: '' });
              setStatusWithTimeout({ type: 'success', message: 'Save created successfully!' });
              await get().refreshSaves();
              completeTutorialAction({ type: 'save-create', source });
            } else {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to write save. Please check storage quota.',
              });
            }
          },

          handleOverwriteLoad: async (record) => {
            try {
              const proceed = await processSaveCustomData(record);
              if (!proceed) return;

              setStatusWithTimeout(
                { type: 'pending', message: 'Loading save...' },
                record.id,
                'load',
              );
              await delay(200);
              const { nodes, edges } = deserializeCanvas(record.data);
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              useFlowStore.getState().setNodesAndEdges(nodes, edges);
              useUIStore.getState().setSavesOverlayOpen(false);
              useUIStore.getState().requestFitView();
            } catch {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to load save data. File may be corrupted.',
              });
            }
          },

          handleMergeLoad: async (record) => {
            try {
              const proceed = await processSaveCustomData(record);
              if (!proceed) return;

              setStatusWithTimeout(
                { type: 'pending', message: 'Merging save...' },
                record.id,
                'merge',
              );
              await delay(200);
              const { nodes: loadedNodes, edges: loadedEdges } = deserializeCanvas(record.data);
              const {
                nodes: currentNodes,
                edges: currentEdges,
                setNodesAndEdges,
              } = useFlowStore.getState();

              const { nodes, edges } = mergeSaveIntoCanvas(
                loadedNodes,
                loadedEdges,
                currentNodes,
                currentEdges,
              );

              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              setNodesAndEdges(nodes, edges);
              useUIStore.getState().setSavesOverlayOpen(false);
              useUIStore.getState().requestFitView();
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

            setStatusWithTimeout(
              { type: 'pending', message: 'Overwriting save file...' },
              record.id,
              'save',
            );
            await delay(200);
            const { nodes, edges } = useFlowStore.getState();
            const overrides = await getDataOverrides();
            const data = serializeCanvas(nodes, edges, overrides);

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
            const record = get().saves.find((s) => s.id === id);
            const name = record?.name || 'this save';

            const confirmed = await useUIStore.getState().confirm({
              title: 'DELETE SAVE',
              message: `Permanently delete "${name}"? This action cannot be undone.`,
              confirmLabel: 'DELETE',
              intent: 'error',
            });
            if (!confirmed) return;

            setStatusWithTimeout({ type: 'pending', message: 'Deleting save...' }, id, 'delete');
            await delay(200);
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
              setStatusWithTimeout({ type: 'pending', message: 'Renaming save...' }, id, 'rename');
              await delay(200);
              const success = await renameSave(id, newName);
              if (success) {
                set((s) => ({
                  editingId: null,
                  saves: s.saves.map((save) =>
                    save.id === id ? { ...save, name: newName } : save,
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

            setStatusWithTimeout(
              { type: 'pending', message: 'Importing JSON save file...' },
              null,
              'import',
            );
            await delay(200);

            const reader = new FileReader();
            reader.onload = async (event) => {
              try {
                const parsed = JSON.parse(event.target?.result as string);
                if (parsed && parsed.data) {
                  const record: SaveRecord = {
                    id: nextSaveId(),
                    name:
                      typeof parsed.name === 'string'
                        ? `${parsed.name} (Imported)`
                        : 'Imported Save',
                    timestamp: Date.now(),
                    data: parsed.data,
                  };
                  const success = await saveSave(record);
                  if (success) {
                    setStatusWithTimeout({
                      type: 'success',
                      message: 'Save imported successfully!',
                    });
                    await get().refreshSaves();
                    void useUIStore.getState().confirm({
                      title: 'IMPORT SUCCESSFUL',
                      message: `Save file "${record.name}" has been successfully imported.`,
                      confirmLabel: 'OK',
                      showCancel: false,
                      intent: 'success',
                    });
                  } else {
                    setStatusWithTimeout({
                      type: 'error',
                      message: 'Failed to store imported save. Storage quota exceeded.',
                    });
                    void useUIStore.getState().confirm({
                      title: 'IMPORT FAILED',
                      message: 'Failed to store the imported save. Browser storage quota may be exceeded.',
                      confirmLabel: 'OK',
                      showCancel: false,
                      intent: 'error',
                    });
                  }
                } else {
                  setStatusWithTimeout({
                    type: 'error',
                    message: 'Invalid save file format. Missing data payload.',
                  });
                  void useUIStore.getState().confirm({
                    title: 'IMPORT FAILED',
                    message: 'Invalid save file format. The file is missing the required data payload.',
                    confirmLabel: 'OK',
                    showCancel: false,
                    intent: 'error',
                  });
                }
              } catch {
                setStatusWithTimeout({
                  type: 'error',
                  message: 'Malformed JSON file. Import failed.',
                });
                void useUIStore.getState().confirm({
                  title: 'IMPORT FAILED',
                  message: 'Malformed JSON file. The file is not a valid JSON save file.',
                  confirmLabel: 'OK',
                  showCancel: false,
                  intent: 'error',
                });
              }
              e.target.value = '';
            };
            reader.onerror = () => {
              setStatusWithTimeout({
                type: 'error',
                message: 'Failed to read file from filesystem.',
              });
              void useUIStore.getState().confirm({
                title: 'IMPORT FAILED',
                message: 'Failed to read the file from the filesystem.',
                confirmLabel: 'OK',
                showCancel: false,
                intent: 'error',
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

            setStatusWithTimeout(
              { type: 'pending', message: 'Rendering PNG snapshot...' },
              null,
              'export_png',
            );
            await delay(200);
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

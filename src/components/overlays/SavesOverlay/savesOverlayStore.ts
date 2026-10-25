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
import type { SaveData, SaveRecord } from '../../../types/saves';
import {
  applySaveSettings,
  deserializeCanvas,
  serializeCanvas,
} from '../../../persistence/transformer';
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
  findDuplicateIdentifiers,
} from '../../../utils/dataValidation';
import {
  getDefaultProducts,
  getDefaultMachines,
  getDefaultResearches,
  reloadDatabase,
} from '../../../data/lookup';
import type { SavesOverlayState, SaveStatus } from './SavesOverlayContext';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function validateSaveOverrides(overrides: { id: string; data: Record<string, unknown> }[]): {
  valid: boolean;
  errorMessages: string[];
} {
  const errorMessages: string[] = [];
  for (const duplicate of findDuplicateIdentifiers(overrides.map((entry) => entry.id))) {
    errorMessages.push(
      `[Override ${duplicate.id}] id: Duplicate override (first seen at index ${duplicate.firstIndex})`,
    );
  }

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
      const res = validateResearch(dataWithId, researchIds);
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

interface SaveCustomDataPlan {
  proceed: boolean;
  overridesToLoad?: { id: string; data: Record<string, unknown> }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSaveOverrides(value: unknown): value is NonNullable<SaveData['dataOverrides']> {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && typeof entry.id === 'string' && isRecord(entry.data))
  );
}

async function prepareSaveCustomData(record: SaveRecord): Promise<SaveCustomDataPlan> {
  const overrides = record.data.dataOverrides;
  if (!overrides || overrides.length === 0) {
    return { proceed: true };
  }
  if (
    !Array.isArray(overrides) ||
    !overrides.every(
      (entry) =>
        entry &&
        typeof entry.id === 'string' &&
        entry.data &&
        typeof entry.data === 'object' &&
        !Array.isArray(entry.data),
    )
  ) {
    return { proceed: true };
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
    return { proceed: false };
  }

  if (loadCustomData === 'confirm') {
    const validation = validateSaveOverrides(overrides);
    if (validation.valid) {
      return { proceed: true, overridesToLoad: overrides };
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

  return { proceed: true };
}

async function commitSaveCustomData(plan: SaveCustomDataPlan): Promise<void> {
  if (!plan.overridesToLoad) return;
  const saveSuccess = await batchSaveDataOverrides(plan.overridesToLoad);
  if (!saveSuccess) {
    throw new Error(
      'Custom database overrides could not be saved. The canvas and settings were not loaded, and your current project was left unchanged.',
    );
  }

  await reloadDatabase();
  useDataStore.setState((state) => ({ dbVersion: state.dbVersion + 1 }));
}

export function createSavesOverlayStore() {
  return createStore(
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

      const reportActionFailure = async (title: string, message: string) => {
        setStatusWithTimeout({ type: 'error', message });
        await useUIStore.getState().confirm({
          title,
          message,
          confirmLabel: 'OK',
          showCancel: false,
          intent: 'error',
        });
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
          let data: SaveData;
          try {
            const overrides = await getDataOverrides();
            data = serializeCanvas(nodes, edges, overrides);
          } catch (error) {
            setStatusWithTimeout({
              type: 'error',
              message:
                error instanceof Error
                  ? `Save was not created. ${error.message}`
                  : 'The current canvas could not be saved.',
            });
            return;
          }

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
            const customDataPlan = await prepareSaveCustomData(record);
            if (!customDataPlan.proceed) return;

            const { nodes, edges, globalSettings } = deserializeCanvas(
              record.data,
              customDataPlan.overridesToLoad,
            );

            setStatusWithTimeout(
              { type: 'pending', message: 'Loading save...' },
              record.id,
              'load',
            );
            await delay(200);
            await commitSaveCustomData(customDataPlan);
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            applySaveSettings(globalSettings);
            useFlowStore.getState().setNodesAndEdges(nodes, edges);
            useUIStore.getState().setSavesOverlayOpen(false);
            useUIStore.getState().requestFitView();
          } catch (error) {
            await reportActionFailure(
              'LOAD FAILED',
              error instanceof Error
                ? error.message
                : 'Failed to load save data. The save was left unchanged.',
            );
          }
        },

        handleMergeLoad: async (record) => {
          try {
            const customDataPlan = await prepareSaveCustomData(record);
            if (!customDataPlan.proceed) return;

            const {
              nodes: loadedNodes,
              edges: loadedEdges,
              globalSettings,
            } = deserializeCanvas(record.data, customDataPlan.overridesToLoad);

            setStatusWithTimeout(
              { type: 'pending', message: 'Merging save...' },
              record.id,
              'merge',
            );
            await delay(200);
            await commitSaveCustomData(customDataPlan);
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
            applySaveSettings(globalSettings);
            setNodesAndEdges(nodes, edges);
            useUIStore.getState().setSavesOverlayOpen(false);
            useUIStore.getState().requestFitView();
          } catch (error) {
            await reportActionFailure(
              'MERGE FAILED',
              error instanceof Error
                ? error.message
                : 'Failed to merge save data. The save was left unchanged.',
            );
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

          try {
            deserializeCanvas(record.data, record.data.dataOverrides);
          } catch (error) {
            setStatusWithTimeout({
              type: 'error',
              message:
                error instanceof Error
                  ? `This save cannot be safely overwritten. ${error.message}`
                  : 'This save cannot be safely overwritten because its data could not be validated.',
            });
            return;
          }

          setStatusWithTimeout(
            { type: 'pending', message: 'Overwriting save file...' },
            record.id,
            'save',
          );
          await delay(200);
          const { nodes, edges } = useFlowStore.getState();
          let data: SaveData;
          try {
            const overrides = await getDataOverrides();
            data = serializeCanvas(nodes, edges, overrides);
          } catch (error) {
            setStatusWithTimeout({
              type: 'error',
              message:
                error instanceof Error
                  ? `Save was not overwritten. ${error.message}`
                  : 'The current canvas could not be saved.',
            });
            return;
          }

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
                saves: s.saves.map((save) => (save.id === id ? { ...save, name: newName } : save)),
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
              const result = event.target?.result;
              if (typeof result !== 'string') {
                await reportActionFailure(
                  'IMPORT FAILED',
                  'The selected file could not be read as a JSON save.',
                );
                return;
              }

              const parsed: unknown = JSON.parse(result);
              if (isRecord(parsed) && 'data' in parsed) {
                const validationOverrides = isRecord(parsed.data)
                  ? isSaveOverrides(parsed.data.dataOverrides)
                    ? parsed.data.dataOverrides
                    : undefined
                  : undefined;
                try {
                  deserializeCanvas(parsed.data, validationOverrides);
                } catch (error) {
                  await reportActionFailure(
                    'IMPORT FAILED',
                    error instanceof Error
                      ? `The save was not imported. ${error.message}`
                      : 'The save could not be validated and was not imported.',
                  );
                  return;
                }

                const record: SaveRecord = {
                  id: nextSaveId(),
                  name:
                    typeof parsed.name === 'string' ? `${parsed.name} (Imported)` : 'Imported Save',
                  timestamp: Date.now(),
                  data: parsed.data as SaveData,
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
                    message:
                      'Failed to store the imported save. Browser storage quota may be exceeded.',
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
                  message:
                    'Invalid save file format. The file is missing the required data payload.',
                  confirmLabel: 'OK',
                  showCancel: false,
                  intent: 'error',
                });
              }
            } catch (error) {
              await reportActionFailure(
                'IMPORT FAILED',
                error instanceof SyntaxError
                  ? 'Malformed JSON file. The file is not a valid JSON save file.'
                  : error instanceof Error
                    ? `The save was not imported. ${error.message}`
                    : 'Import failed because the save file could not be processed.',
              );
            } finally {
              e.target.value = '';
            }
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
            const message =
              err instanceof Error ? err.message : 'The canvas renderer returned an unknown error.';
            await reportActionFailure('PNG export failed', message);
          }
        },
      };
    }),
  );
}

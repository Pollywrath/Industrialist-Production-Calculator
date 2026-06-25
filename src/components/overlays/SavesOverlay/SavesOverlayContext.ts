import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';
import type { SaveRecord } from '../../../types/saves';

export interface SaveStatus {
  type: 'idle' | 'pending' | 'success' | 'error';
  message: string;
}

export type SaveCreateSource = 'button' | 'keyboard';

export interface SavesOverlayState {
  saves: SaveRecord[];
  newSaveName: string;
  editingId: string | null;
  editName: string;
  status: SaveStatus;
  pendingId: string | null;
  pendingAction:
    | 'load'
    | 'merge'
    | 'save'
    | 'delete'
    | 'rename'
    | 'create'
    | 'import'
    | 'export_png'
    | null;

  setNewSaveName: (name: string) => void;
  setEditName: (name: string) => void;
  setStatus: (status: SaveStatus) => void;
  clearStatus: () => void;

  refreshSaves: () => Promise<void>;
  handleCreateSave: (source: SaveCreateSource) => Promise<void>;
  handleOverwriteLoad: (record: SaveRecord) => Promise<void>;
  handleMergeLoad: (record: SaveRecord) => Promise<void>;
  handleOverwriteSave: (record: SaveRecord) => Promise<void>;
  handleDeleteSave: (id: string) => Promise<void>;
  startRename: (record: SaveRecord) => void;
  commitRename: (id: string) => Promise<void>;
  cancelRename: () => void;
  handleImportJson: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleExportJson: (record: SaveRecord) => void;
  handleExportPng: () => Promise<void>;
}

export const SavesOverlayContext = createContext<StoreApi<SavesOverlayState> | undefined>(
  undefined,
);

export function useSavesOverlayStore<T>(selector: (state: SavesOverlayState) => T): T {
  const store = useContext(SavesOverlayContext);
  if (!store) {
    throw new Error('useSavesOverlayStore must be used within a SavesOverlayProvider');
  }
  return useStore(store, selector);
}

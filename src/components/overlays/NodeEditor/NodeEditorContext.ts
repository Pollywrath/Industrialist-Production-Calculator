import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';
import type { Recipe } from '../../../types/data';

export interface NodeEditorState {
  inputs: number[];
  outputs: number[];
  machineCount: number;
  machineCountStr: string;
  qtyStrMap: Record<string, string>;
  activeTab: 'count' | 'settings';
  settings: Record<string, unknown>;

  setInputs: (inputs: number[]) => void;
  setOutputs: (outputs: number[]) => void;
  setMachineCount: (count: number) => void;
  setMachineCountStr: (str: string) => void;
  setQtyStrMap: (
    updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  setActiveTab: (tab: 'count' | 'settings') => void;
  updateSetting: (key: string, value: unknown) => void;
  getCurrentRecipe: () => Recipe;

  handleMove: (side: 'input' | 'output', listIdx: number, direction: -1 | 1) => void;
  handleQtyChange: (
    side: 'input' | 'output',
    index: number,
    rawVal: string,
    normalizedBaseQuantity: number,
  ) => void;
  handleQtyBlur: (side: 'input' | 'output', index: number, normalizedBaseQuantity: number) => void;
  handleMachineCountChange: (rawVal: string) => void;
  handleMachineCountBlur: () => void;
  handleResetHandles: () => void;
}

export const NodeEditorContext = createContext<StoreApi<NodeEditorState> | undefined>(undefined);

export function useNodeEditorStore<T>(selector: (state: NodeEditorState) => T): T {
  const store = useContext(NodeEditorContext);
  if (!store) {
    throw new Error('useNodeEditorStore must be used within a NodeEditorProvider');
  }
  return useStore(store, selector);
}

import React, { useState } from 'react';
import { createStore } from 'zustand';
import type { Recipe } from '../../../types/data';
import type { RecipeNodeData } from '../../../types/nodes';
import { NodeEditorContext, type NodeEditorState } from './NodeEditorContext';
import {
  cleanFlow,
  cleanMachineCount,
  toPlainString,
  computeQuantityMap,
} from '../../../utils/recipeComputation';
import { getSpecialRecipe } from '../../../data/registry';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';

interface NodeEditorProviderProps {
  children: React.ReactNode;
  recipe: Recipe;
  initialData: RecipeNodeData;
  multiplier: number;
}

export function NodeEditorProvider({
  children,
  recipe,
  initialData,
  multiplier,
}: NodeEditorProviderProps) {
  const [store] = useState(() =>
    createStore<NodeEditorState>((set, get) => ({
      inputs: initialData.inputOrder ?? recipe.inputs.map((_, i) => i),
      outputs: initialData.outputOrder ?? recipe.outputs.map((_, i) => i),
      machineCount: initialData.machineCount,
      machineCountStr: toPlainString(initialData.machineCount, 12),
      qtyStrMap: computeQuantityMap(
        recipe,
        initialData.inputOrder ?? recipe.inputs.map((_, i) => i),
        initialData.outputOrder ?? recipe.outputs.map((_, i) => i),
        initialData.machineCount,
        multiplier,
      ),
      activeTab: 'count',
      settings:
        initialData.settings ??
        (() => {
          const sr = getSpecialRecipe(recipe.id);
          if (!sr) return {};
          return Object.entries(sr.settings).reduce(
            (acc, [key, def]) => {
              acc[key] = def.default;
              return acc;
            },
            {} as Record<string, unknown>,
          );
        })(),

      getCurrentRecipe: () => {
        const { settings } = get();
        const sr = getSpecialRecipe(recipe.id);
        const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
          string,
          unknown
        >;
        return sr ? sr.compute(settings, globalSettings) : recipe;
      },

      setInputs: (inputs) => set({ inputs }),
      setOutputs: (outputs) => set({ outputs }),
      setMachineCount: (machineCount) => set({ machineCount }),
      setMachineCountStr: (machineCountStr) => set({ machineCountStr }),
      setQtyStrMap: (updater) =>
        set((state) => ({
          qtyStrMap: typeof updater === 'function' ? updater(state.qtyStrMap) : updater,
        })),
      setActiveTab: (activeTab) => set({ activeTab }),
      updateSetting: (key, value) => {
        const { settings, inputs, outputs, machineCount } = get();
        const newSettings = { ...settings, [key]: value };
        const sr = getSpecialRecipe(recipe.id);
        const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
          string,
          unknown
        >;
        const currentRecipe = sr ? sr.compute(newSettings, globalSettings) : recipe;

        set({
          settings: newSettings,
          qtyStrMap: computeQuantityMap(currentRecipe, inputs, outputs, machineCount, multiplier),
        });
      },

      handleMove: (side, listIdx, direction) => {
        const { inputs, outputs } = get();
        const activeList = side === 'input' ? inputs : outputs;
        if (listIdx + direction < 0 || listIdx + direction >= activeList.length) return;
        const newList = [...activeList];
        const temp = newList[listIdx];
        newList[listIdx] = newList[listIdx + direction];
        newList[listIdx + direction] = temp;

        if (side === 'input') {
          set({ inputs: newList });
        } else {
          set({ outputs: newList });
        }
      },

      handleQtyChange: (side, index, rawVal, normalizedBaseQuantity) => {
        if (!/^\d*(\.\d{0,8})?$/.test(rawVal)) return;

        const { inputs, outputs } = get();
        const key = `${side}-${index}`;
        const parsed = parseFloat(rawVal);

        if (!isNaN(parsed) && parsed >= 0) {
          const cleaned = cleanFlow(parsed);
          if (normalizedBaseQuantity > 0) {
            const newMachineCount = cleanMachineCount(cleaned / normalizedBaseQuantity);
            set({
              machineCount: newMachineCount,
              machineCountStr: toPlainString(newMachineCount, 12),
              qtyStrMap: computeQuantityMap(
                get().getCurrentRecipe(),
                inputs,
                outputs,
                newMachineCount,
                multiplier,
                key,
                rawVal,
              ),
            });
          } else {
            set((state) => ({
              qtyStrMap: { ...state.qtyStrMap, [key]: rawVal },
            }));
          }
        } else {
          set({
            machineCount: 0,
            machineCountStr: '',
            qtyStrMap: computeQuantityMap(
              get().getCurrentRecipe(),
              inputs,
              outputs,
              0,
              multiplier,
              key,
              rawVal,
            ),
          });
        }
      },

      handleQtyBlur: (side, index, normalizedBaseQuantity) => {
        const { inputs, outputs, qtyStrMap } = get();
        const key = `${side}-${index}`;
        const currentVal = qtyStrMap[key] || '';
        const parsed = parseFloat(currentVal);

        if (!isNaN(parsed) && parsed >= 0) {
          const cleaned = cleanFlow(parsed);
          const newMachineCount = cleanMachineCount(cleaned / normalizedBaseQuantity);
          set({
            qtyStrMap: computeQuantityMap(
              get().getCurrentRecipe(),
              inputs,
              outputs,
              newMachineCount,
              multiplier,
              key,
              toPlainString(cleaned, 8),
            ),
          });
        } else {
          set({
            machineCount: 0,
            machineCountStr: '0',
            qtyStrMap: computeQuantityMap(get().getCurrentRecipe(), inputs, outputs, 0, multiplier),
          });
        }
      },

      handleMachineCountChange: (rawVal) => {
        if (!/^\d*(\.\d{0,12})?$/.test(rawVal)) return;

        const { inputs, outputs } = get();
        set({ machineCountStr: rawVal });

        const parsed = parseFloat(rawVal);
        if (!isNaN(parsed) && parsed >= 0) {
          const cleaned = cleanMachineCount(parsed);
          set({
            machineCount: cleaned,
            qtyStrMap: computeQuantityMap(
              get().getCurrentRecipe(),
              inputs,
              outputs,
              cleaned,
              multiplier,
            ),
          });
        } else {
          set({
            machineCount: 0,
            qtyStrMap: computeQuantityMap(get().getCurrentRecipe(), inputs, outputs, 0, multiplier),
          });
        }
      },

      handleMachineCountBlur: () => {
        const { inputs, outputs, machineCountStr } = get();
        const parsed = parseFloat(machineCountStr);
        if (!isNaN(parsed) && parsed >= 0) {
          const cleaned = cleanMachineCount(parsed);
          set({
            machineCount: cleaned,
            machineCountStr: toPlainString(cleaned, 12),
            qtyStrMap: computeQuantityMap(
              get().getCurrentRecipe(),
              inputs,
              outputs,
              cleaned,
              multiplier,
            ),
          });
        } else {
          set({
            machineCount: 0,
            machineCountStr: '0',
            qtyStrMap: computeQuantityMap(get().getCurrentRecipe(), inputs, outputs, 0, multiplier),
          });
        }
      },

      handleResetHandles: () => {
        const { machineCount } = get();
        const defaultInputs = recipe.inputs.map((_, i) => i);
        const defaultOutputs = recipe.outputs.map((_, i) => i);
        set({
          inputs: defaultInputs,
          outputs: defaultOutputs,
          qtyStrMap: computeQuantityMap(
            get().getCurrentRecipe(),
            defaultInputs,
            defaultOutputs,
            machineCount,
            multiplier,
          ),
        });
      },
    })),
  );

  return <NodeEditorContext.Provider value={store}>{children}</NodeEditorContext.Provider>;
}

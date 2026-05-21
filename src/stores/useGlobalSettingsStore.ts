import { create } from 'zustand';
import { useFlowStore } from './useFlowStore';

export interface GlobalSettings {
  global_pollution: number;
}

interface GlobalSettingsState {
  settings: GlobalSettings;
  setGlobalPollution: (value: number) => void;
}

export const useGlobalSettingsStore = create<GlobalSettingsState>((set) => ({
  settings: {
    global_pollution: 10,
  },
  setGlobalPollution: (value: number) =>
    set((state) => {
      const nextSettings = { ...state.settings, global_pollution: value };

      useFlowStore.setState((flowState) => ({
        solverVersion: flowState.solverVersion + 1,
      }));

      return { settings: nextSettings };
    }),
}));

import { create } from 'zustand';

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
      if (state.settings.global_pollution === value) return state;

      const nextSettings = { ...state.settings, global_pollution: value };

      return { settings: nextSettings };
    }),
}));

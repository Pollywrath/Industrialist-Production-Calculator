import { create } from 'zustand';
import { getAllResearches } from '../data/lookup';

const ALWAYS_UNLOCKED_SEEDS: Record<string, string[]> = {
  normal: [
    's_production_production',
    's_production_coal_extracting',
    's_production_research_station_1',
    's_energy_energy',
    's_energy_renewables',
    's_energy_hand_crank',
    's_energy_solar_panel_1',
    's_energy_low_capacity_infrastructure',
    's_energy_lv_pole',
    's_utility_utility',
    's_utility_transportation',
    's_utility_truck_depot',
    's_utility_pipes',
  ],
  hard: [
    's_production_production',
    's_production_coal_extracting',
    's_production_research_station_1',
    's_energy_energy',
    's_energy_renewables',
    's_energy_solar_panel_1',
    's_energy_low_capacity_infrastructure',
    's_energy_lv_pole',
    's_utility_utility',
    's_utility_transportation',
    's_utility_truck_depot',
    's_utility_pipes',
  ],
  impossible: [
    's_production_production',
    's_production_coal_extracting',
    's_production_research_station_1',
    's_energy_energy',
    's_energy_renewables',
    's_energy_solar_panel_1',
    's_energy_low_capacity_infrastructure',
    's_utility_utility',
    's_utility_transportation',
    's_utility_truck_depot',
    's_utility_pipes',
  ],
  impossible2: [
    's_production_production',
    's_production_coal_extracting',
    's_production_research_station_1',
    's_energy_energy',
    's_energy_renewables',
    's_energy_solar_panel_1',
    's_energy_low_capacity_infrastructure',
    's_utility_utility',
    's_utility_transportation',
    's_utility_truck_depot',
    's_utility_pipes',
  ],
  sandbox: [],
  sandbox_plus: [],
};

export interface GlobalSettings {
  global_pollution: number;
  difficulty: string;
  unlockedResearchIds: string[];
  oreNodesEnabled: boolean;
  showVariantLimited: boolean;
}

interface GlobalSettingsState {
  settings: GlobalSettings;
  setGlobalPollution: (value: number) => void;
  setDifficulty: (value: string) => void;
  setUnlockedResearchIds: (value: string[] | ((prev: string[]) => string[])) => void;
  setOreNodesEnabled: (value: boolean) => void;
  setShowVariantLimited: (value: boolean) => void;
  importSettings: (settings: Partial<GlobalSettings>) => void;
}

export const useGlobalSettingsStore = create<GlobalSettingsState>((set) => {
  return {
    settings: {
      global_pollution: 10,
      difficulty: 'sandbox',
      unlockedResearchIds: [],
      oreNodesEnabled: false,
      showVariantLimited: false,
    },
    setGlobalPollution: (value: number) =>
      set((state) => {
        const difficulty = state.settings.difficulty;
        let finalValue = value;
        if ((difficulty === 'impossible' || difficulty === 'impossible2') && finalValue < 0) {
          finalValue = 0;
        }
        if (state.settings.global_pollution === finalValue) return state;

        const nextSettings = { ...state.settings, global_pollution: finalValue };
        return { settings: nextSettings };
      }),
    setDifficulty: (difficulty: string) =>
      set((state) => {
        if (state.settings.difficulty === difficulty) return state;

        let nextPollution = state.settings.global_pollution;
        if ((difficulty === 'impossible' || difficulty === 'impossible2') && nextPollution < 0) {
          nextPollution = 0;
        }

        let unlockedResearchIds: string[];
        if (difficulty === 'sandbox' || difficulty === 'sandbox_plus') {
          unlockedResearchIds = getAllResearches().map((r) => r.id);
        } else {
          unlockedResearchIds = ALWAYS_UNLOCKED_SEEDS[difficulty] || ALWAYS_UNLOCKED_SEEDS.normal;
        }

        const nextSettings = {
          ...state.settings,
          difficulty,
          unlockedResearchIds,
          global_pollution: nextPollution,
          oreNodesEnabled: difficulty === 'impossible2',
        };
        return { settings: nextSettings };
      }),
    setUnlockedResearchIds: (value) =>
      set((state) => {
        const nextIds = typeof value === 'function' ? value(state.settings.unlockedResearchIds) : value;
        const nextSettings = { ...state.settings, unlockedResearchIds: nextIds };
        return { settings: nextSettings };
      }),
    setOreNodesEnabled: (oreNodesEnabled: boolean) =>
      set((state) => {
        if (state.settings.oreNodesEnabled === oreNodesEnabled) return state;
        const nextSettings = { ...state.settings, oreNodesEnabled };
        return { settings: nextSettings };
      }),
    setShowVariantLimited: (showVariantLimited: boolean) =>
      set((state) => {
        if (state.settings.showVariantLimited === showVariantLimited) return state;
        const nextSettings = { ...state.settings, showVariantLimited };
        return { settings: nextSettings };
      }),
    importSettings: (settings) =>
      set((state) => {
        const nextSettings = {
          global_pollution: settings.global_pollution ?? state.settings.global_pollution,
          difficulty: settings.difficulty ?? state.settings.difficulty,
          unlockedResearchIds: settings.unlockedResearchIds ?? state.settings.unlockedResearchIds,
          oreNodesEnabled: settings.oreNodesEnabled ?? state.settings.oreNodesEnabled,
          showVariantLimited: settings.showVariantLimited ?? state.settings.showVariantLimited,
        };
        return { settings: nextSettings };
      }),
  };
});

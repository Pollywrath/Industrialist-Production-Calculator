import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { clamp } from '../../utils/precision';

const settingDefinitions = {
  steam_temp: {
    type: 'number' as const,
    label: 'Steam Temperature (°C)',
    default: 400,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  0: 'steam_temp',
};

const getMultiplier = (settings: Record<string, unknown>) => {
  const temp = (settings.steam_temp as number) ?? 100;
  return clamp(temp / 100, 0, 4);
};

export const m_industrial_drill_01: SpecialRecipe = {
  id: 'r_industrial_drill_01',
  name: 'Extract Raw Iron',
  machine_id: 'm_industrial_drill',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const multiplier = getMultiplier(settings);

    const recipe: Recipe = {
      id: 'r_industrial_drill_01',
      name: 'Extract Raw Iron',
      machine_id: 'm_industrial_drill',
      cycle_time: 8,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_steam', quantity: 720 }],
      outputs: [{ product_id: 'p_raw_iron', quantity: 10 * multiplier, temperature: 18 }],
    };

    return recipe;
  },
};

export const m_industrial_drill_02: SpecialRecipe = {
  id: 'r_industrial_drill_02',
  name: 'Extract Raw Copper',
  machine_id: 'm_industrial_drill',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const multiplier = getMultiplier(settings);

    const recipe: Recipe = {
      id: 'r_industrial_drill_02',
      name: 'Extract Raw Copper',
      machine_id: 'm_industrial_drill',
      cycle_time: 8,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_steam', quantity: 720 }],
      outputs: [{ product_id: 'p_raw_copper', quantity: 10 * multiplier, temperature: 18 }],
    };

    return recipe;
  },
};

export const m_industrial_drill_03: SpecialRecipe = {
  id: 'r_industrial_drill_03',
  name: 'Extract Bauxite Residue',
  machine_id: 'm_industrial_drill',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const multiplier = getMultiplier(settings);

    const recipe: Recipe = {
      id: 'r_industrial_drill_03',
      name: 'Extract Bauxite Residue',
      machine_id: 'm_industrial_drill',
      cycle_time: 8,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_steam', quantity: 720 }],
      outputs: [{ product_id: 'p_bauxite_residue', quantity: 0.5 * multiplier, temperature: 18 }],
    };

    return recipe;
  },
};

import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { clamp } from '../../utils/precision';

const calculateCycleTime = (tempC: number): number => {
  const t = Math.max(0, tempC);
  const factor = clamp(1 - t / 400, 0.1, 1);
  const ticks = Math.ceil(900 * factor);
  return ticks / 30;
};

const settingDefinitions = {
  steam_temp: {
    type: 'number' as const,
    label: 'Steam Temperature (°C)',
    default: 400,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  1: 'steam_temp',
};

export const steam_cracking_plant_01: SpecialRecipe = {
  id: 'r_steam_cracking_plant_01',
  name: 'Makes Paraxylene, Ethylene',
  machine_id: 'm_steam_cracking_plant',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const cycleTime = calculateCycleTime(steamTemp);

    const recipe: Recipe = {
      id: 'r_steam_cracking_plant_01',
      name: 'Makes Paraxylene, Ethylene',
      machine_id: 'm_steam_cracking_plant',
      cycle_time: cycleTime,
      power_consumption: 60000,
      power_type: 'MV',
      pollution: 0.432,
      inputs: [
        { product_id: 'p_crude_oil', quantity: 2 },
        { product_id: 'p_steam', quantity: 150 },
      ],
      outputs: [
        { product_id: 'p_paraxylene', quantity: 2, temperature: 18 },
        { product_id: 'p_ethylene', quantity: 3, temperature: 18 },
      ],
    };

    return recipe;
  },
};

export const steam_cracking_plant_02: SpecialRecipe = {
  id: 'r_steam_cracking_plant_02',
  name: 'Makes Crude Diesel, Residue',
  machine_id: 'm_steam_cracking_plant',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const cycleTime = calculateCycleTime(steamTemp);

    const recipe: Recipe = {
      id: 'r_steam_cracking_plant_02',
      name: 'Makes Crude Diesel, Residue',
      machine_id: 'm_steam_cracking_plant',
      cycle_time: cycleTime,
      power_consumption: 60000,
      power_type: 'MV',
      pollution: 0.432,
      inputs: [
        { product_id: 'p_light_oil', quantity: 15 },
        { product_id: 'p_steam', quantity: 150 },
      ],
      outputs: [
        { product_id: 'p_crude_diesel', quantity: 12, temperature: 18 },
        { product_id: 'p_residue', quantity: 3, temperature: 18 },
      ],
    };

    return recipe;
  },
};

export const steam_cracking_plant_03: SpecialRecipe = {
  id: 'r_steam_cracking_plant_03',
  name: 'Makes Light Oil, Residue',
  machine_id: 'm_steam_cracking_plant',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const cycleTime = calculateCycleTime(steamTemp);

    const recipe: Recipe = {
      id: 'r_steam_cracking_plant_03',
      name: 'Makes Light Oil, Residue',
      machine_id: 'm_steam_cracking_plant',
      cycle_time: cycleTime,
      power_consumption: 60000,
      power_type: 'MV',
      pollution: 0.432,
      inputs: [
        { product_id: 'p_heavy_oil', quantity: 20 },
        { product_id: 'p_steam', quantity: 150 },
      ],
      outputs: [
        { product_id: 'p_light_oil', quantity: 12, temperature: 18 },
        { product_id: 'p_residue', quantity: 8, temperature: 18 },
      ],
    };

    return recipe;
  },
};

export const steam_cracking_plant_04: SpecialRecipe = {
  id: 'r_steam_cracking_plant_04',
  name: 'Makes Naphtha, Residue',
  machine_id: 'm_steam_cracking_plant',
  settings: {},
  compute: () => {
    const recipe: Recipe = {
      id: 'r_steam_cracking_plant_04',
      name: 'Makes Naphtha, Residue',
      machine_id: 'm_steam_cracking_plant',
      cycle_time: 3,
      power_consumption: 60000,
      power_type: 'MV',
      pollution: 0.432,
      inputs: [
        { product_id: 'p_heavy_oil', quantity: 20 },
        { product_id: 'p_hydrogen', quantity: 3 },
      ],
      outputs: [
        { product_id: 'p_naphtha', quantity: 15, temperature: 18 },
        { product_id: 'p_residue', quantity: 5, temperature: 18 },
      ],
    };
    return recipe;
  },
};

export const steam_cracking_plant_05: SpecialRecipe = {
  id: 'r_steam_cracking_plant_05',
  name: 'Makes Light Oil, Residue',
  machine_id: 'm_steam_cracking_plant',
  settings: {},
  compute: () => {
    const recipe: Recipe = {
      id: 'r_steam_cracking_plant_05',
      name: 'Makes Light Oil, Residue',
      machine_id: 'm_steam_cracking_plant',
      cycle_time: 3,
      power_consumption: 60000,
      power_type: 'MV',
      pollution: 0.432,
      inputs: [
        { product_id: 'p_naphtha', quantity: 20 },
        { product_id: 'p_hydrogen', quantity: 3 },
      ],
      outputs: [
        { product_id: 'p_light_oil', quantity: 15, temperature: 18 },
        { product_id: 'p_residue', quantity: 5, temperature: 18 },
      ],
    };
    return recipe;
  },
};
